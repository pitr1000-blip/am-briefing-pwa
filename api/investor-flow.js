// Vercel Serverless Function: GET /api/investor-flow
// 외국인/기관 순매수 상위 종목을 한국투자증권(KIS) Open API로 조회합니다.
//
// 필요 환경변수 (Vercel 프로젝트 > Settings > Environment Variables):
//   KIS_APP_KEY, KIS_APP_SECRET  (실전투자 앱키/앱시크릿)
//
// 참고: KIS 공식 샘플 저장소(github.com/koreainvestment/open-trading-api)의
// examples_llm/domestic_stock/foreign_institution_total/ 을 기반으로 작성.
// TR_ID FHPTJ04400000 = 국내기관_외국인 매매종목가집계[국내주식-037].
// 실제 응답 필드/단위는 이 세션에서 직접 호출 테스트를 못 해봤기 때문에(네트워크 제한),
// 배포 후 최초 확인이 꼭 필요합니다 — 문제가 있으면 raw 필드를 그대로 내려주는
// ok:false 응답으로 원인 파악이 가능하게 만들어뒀어요.

const KIS_BASE = "https://openapi.koreainvestment.com:9443";

// 콜드 스타트 사이에도 최대한 재사용되도록 모듈 스코프에 캐시.
// KIS는 6시간 이내 재발급 요청 시 기존 토큰과 동일한 값을 돌려주므로,
// 캐시가 비어 매번 새로 발급받아도 안전합니다(약간의 지연만 추가됨).
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getToken(appkey, appsecret) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60_000) {
    return cachedToken;
  }
  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/plain", charset: "UTF-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey, appsecret }),
  });
  if (!res.ok) {
    throw new Error(`token request failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("token response missing access_token: " + JSON.stringify(data).slice(0, 300));
  }
  cachedToken = data.access_token;
  // access_token_token_expired 형식 예: "2026-09-01 10:23:45" (KST)
  const parsed = Date.parse(String(data.access_token_token_expired || "").replace(" ", "T") + "+09:00");
  cachedTokenExpiresAt = Number.isFinite(parsed) ? parsed : now + 23 * 60 * 60 * 1000;
  return cachedToken;
}

async function fetchRanking(token, appkey, appsecret, etcClsCode) {
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "V",
    FID_COND_SCR_DIV_CODE: "16449",
    FID_INPUT_ISCD: "0000", // 0000 = 전체 시장
    FID_DIV_CLS_CODE: "0", // 0 = 수량정열 (수량 기준 표시라 단위가 "주"로 명확함)
    FID_RANK_SORT_CLS_CODE: "0", // 0 = 순매수상위
    FID_ETC_CLS_CODE: etcClsCode, // 1 = 외국인, 2 = 기관계
  });
  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/foreign-institution-total?${params.toString()}`,
    {
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
        appkey,
        appsecret,
        tr_id: "FHPTJ04400000",
        custtype: "P",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`ranking request failed (etc_cls_code=${etcClsCode}): ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.output)) {
    return { items: [], raw: data };
  }
  const items = data.output.slice(0, 5).map((row) => ({
    code: row.mksc_shrn_iscd || null,
    name: row.hts_kor_isnm || null,
    price: row.stck_prpr != null ? Number(row.stck_prpr) : null,
    changeRate: row.prdy_ctrt != null ? Number(row.prdy_ctrt) : null,
    direction: row.prdy_vrss_sign === "2" ? "up" : row.prdy_vrss_sign === "5" ? "down" : "flat",
    foreignNetBuyQty: row.frgn_ntby_qty != null ? Number(row.frgn_ntby_qty) : null,
    institutionNetBuyQty: row.orgn_ntby_qty != null ? Number(row.orgn_ntby_qty) : null,
  }));
  return { items };
}

module.exports = async function handler(req, res) {
  const appkey = process.env.KIS_APP_KEY;
  const appsecret = process.env.KIS_APP_SECRET;
  if (!appkey || !appsecret) {
    res.status(200).json({ ok: false, error: "KIS_APP_KEY/KIS_APP_SECRET 환경변수가 설정되지 않았어요." });
    return;
  }
  try {
    const token = await getToken(appkey, appsecret);
    const [foreignRes, institutionRes] = await Promise.all([
      fetchRanking(token, appkey, appsecret, "1"),
      fetchRanking(token, appkey, appsecret, "2"),
    ]);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({
      ok: true,
      foreignTop: foreignRes.items,
      institutionTop: institutionRes.items,
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    res.status(200).json({ ok: false, error: String((err && err.message) || err) });
  }
};
