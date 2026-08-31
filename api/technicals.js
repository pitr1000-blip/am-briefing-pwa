// Vercel Serverless Function: GET /api/technicals?code=005930
// 이동평균(5/20/60일), RSI(14), 거래량 급증 여부를 네이버 금융의 일별 캔들
// 데이터로 계산합니다.
//
// 참고: quote.js/search.js와 같은 계열의 비공식 모바일 API를 사용하지만
// 이 특정 엔드포인트(차트/캔들)는 이번 세션에서 직접 호출 테스트를 못
// 해봤어요(네트워크 제한). 배포 후 실제로 확인이 필요합니다 — 응답
// 스키마가 예상과 다르면 raw 데이터를 그대로 내려주는 ok:false 응답으로
// 원인 파악이 가능하게 만들어뒀어요.

module.exports = async function handler(req, res) {
  const code = String(req.query.code || "").trim();

  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ ok: false, error: "code must be a 6-digit KRX stock code" });
    return;
  }

  try {
    const upstream = await fetch(
      `https://m.stock.naver.com/api/chart/domestic/item/${code}?periodType=dayCandle&count=90`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AMBriefing/1.0)",
          Accept: "application/json",
        },
      }
    );

    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: `upstream returned ${upstream.status}` });
      return;
    }

    const data = await upstream.json();

    // 응답이 배열([...캔들]) 형태인지, {priceInfos:[...]} 형태인지 방어적으로 처리
    const candles = Array.isArray(data) ? data : Array.isArray(data && data.priceInfos) ? data.priceInfos : null;

    if (!candles || candles.length < 21) {
      res.status(200).json({ ok: false, error: "unexpected upstream shape or not enough candles", raw: data });
      return;
    }

    const rows = candles
      .map((c) => ({
        date: c.localDate || c.date || c.bizDate || null,
        close: Number(c.closePrice ?? c.close ?? c.tcp),
        volume: Number(c.accumulatedTradingVolume ?? c.volume ?? c.atv),
      }))
      .filter((r) => Number.isFinite(r.close) && Number.isFinite(r.volume))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (rows.length < 21) {
      res.status(200).json({ ok: false, error: "not enough valid candles after parsing", raw: data });
      return;
    }

    function sma(n) {
      if (rows.length < n) return null;
      const slice = rows.slice(-n);
      return slice.reduce((a, r) => a + r.close, 0) / n;
    }

    // RSI(14), 단순이동평균 방식(Wilder 평활화 아님 — 근사치)
    function rsi(n) {
      if (rows.length < n + 1) return null;
      const slice = rows.slice(-(n + 1));
      let gains = 0;
      let losses = 0;
      for (let i = 1; i < slice.length; i++) {
        const diff = slice[i].close - slice[i - 1].close;
        if (diff > 0) gains += diff;
        else losses += -diff;
      }
      const avgGain = gains / n;
      const avgLoss = losses / n;
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - 100 / (1 + rs);
    }

    const latest = rows[rows.length - 1];
    const sma5 = sma(5);
    const sma20 = sma(20);
    const sma60 = sma(60);
    const rsi14 = rsi(14);

    const prevVolRows = rows.slice(-21, -1); // 오늘 제외 최근 20일
    const volAvg20 = prevVolRows.length === 20 ? prevVolRows.reduce((a, r) => a + r.volume, 0) / 20 : null;
    const volumeRatio = volAvg20 ? latest.volume / volAvg20 : null;

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    res.status(200).json({
      ok: true,
      code,
      asOfDate: latest.date,
      price: latest.close,
      sma5,
      sma20,
      sma60,
      priceVsSma20: sma20 ? ((latest.close - sma20) / sma20) * 100 : null,
      rsi14,
      volumeToday: latest.volume,
      volumeAvg20: volAvg20,
      volumeRatio,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};
