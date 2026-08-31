// Vercel Serverless Function: GET /api/quote?code=005930
// Fetches a live-ish quote for a KRX stock code from Naver Finance's
// public (unofficial, undocumented) JSON endpoint.
//
// NOTE: this endpoint is not an official/contracted API. Naver can change
// its shape at any time without notice. This handler parses defensively
// and returns { ok:false, raw } on anything unexpected so the frontend can
// degrade gracefully instead of crashing, and so we can debug quickly.

module.exports = async function handler(req, res) {
  const code = String(req.query.code || "").trim();

  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ ok: false, error: "code must be a 6-digit KRX stock code" });
    return;
  }

  try {
    const upstream = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AMBriefing/1.0)",
        Accept: "application/json",
      },
    });

    if (!upstream.ok) {
      res.status(502).json({
        ok: false,
        error: `upstream returned ${upstream.status}`,
      });
      return;
    }

    const data = await upstream.json();

    // Defensive field extraction — Naver's shape has drifted before.
    const name = data.stockName || data.stockNameEng || null;
    const priceRaw = data.closePrice;
    const price = priceRaw != null ? Number(String(priceRaw).replace(/,/g, "")) : null;

    const changeRaw = data.compareToPreviousClosePrice;
    const change = changeRaw != null ? Number(String(changeRaw).replace(/,/g, "")) : null;

    const dirCode =
      (data.compareToPreviousPrice && data.compareToPreviousPrice.code) || null; // "2"=up "5"=down "3"=flat
    const direction = dirCode === "2" ? "up" : dirCode === "5" ? "down" : "flat";

    const changeRateRaw = data.fluctuationsRatio;
    const changeRate = changeRateRaw != null ? Number(changeRateRaw) : null;

    const per = data.per != null ? Number(data.per) : null;
    const pbr = data.pbr != null ? Number(data.pbr) : null;

    // 52-week high/low sometimes live under different keys depending on
    // Naver's current schema — try a few known shapes.
    let high52 = null;
    let low52 = null;
    if (data.stockHighLow) {
      high52 = Number(String(data.stockHighLow.high52w ?? data.stockHighLow.high ?? "").replace(/,/g, "")) || null;
      low52 = Number(String(data.stockHighLow.low52w ?? data.stockHighLow.low ?? "").replace(/,/g, "")) || null;
    }
    if ((high52 == null || low52 == null) && Array.isArray(data.stockItemTotalInfos)) {
      for (const item of data.stockItemTotalInfos) {
        const label = String(item.key || item.code || "").toLowerCase();
        if (label.includes("high") || item.key === "high52wPrice") high52 = Number(String(item.value).replace(/,/g, "")) || high52;
        if (label.includes("low") || item.key === "low52wPrice") low52 = Number(String(item.value).replace(/,/g, "")) || low52;
      }
    }

    if (!name || price == null || Number.isNaN(price)) {
      // Shape didn't match what we expected — surface raw data for debugging
      // instead of pretending we have a valid quote.
      res.status(200).json({ ok: false, error: "unexpected upstream shape", raw: data });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({
      ok: true,
      code,
      name,
      price,
      change,
      direction,
      changeRate,
      per: Number.isFinite(per) ? per : null,
      pbr: Number.isFinite(pbr) ? pbr : null,
      high52: Number.isFinite(high52) ? high52 : null,
      low52: Number.isFinite(low52) ? low52 : null,
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};
