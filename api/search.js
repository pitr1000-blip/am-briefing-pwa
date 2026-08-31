// Vercel Serverless Function: GET /api/search?q=삼성전자  (or a 6-digit code)
// Resolves a free-text query to KRX stock codes using Naver Finance's
// public (unofficial) autocomplete endpoint. Same caveat as quote.js:
// this is not an official API and may need re-mapping if Naver changes it.

module.exports = async function handler(req, res) {
  const q = String(req.query.q || "").trim();

  if (!q) {
    res.status(400).json({ ok: false, error: "q is required" });
    return;
  }

  // Shortcut: a bare 6-digit code doesn't need search at all.
  if (/^\d{6}$/.test(q)) {
    res.status(200).json({ ok: true, items: [{ code: q, name: null }] });
    return;
  }

  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock&where=nexearch`;
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AMBriefing/1.0)",
        Accept: "application/json",
        Referer: "https://finance.naver.com/",
      },
    });

    if (!upstream.ok) {
      res.status(200).json({ ok: false, error: `upstream returned ${upstream.status}` });
      return;
    }

    const data = await upstream.json();

    // 네이버 자동완성 응답 스키마가 바뀔 수 있어서, 알려진 형태
    // ({ items: [ [ [code, name, ...], ... ] ] })뿐 아니라 응답 전체를
    // 재귀로 훑으면서 "6자리 코드 + 이름"으로 보이는 배열/객체를 전부
    // 찾아내도록 방어적으로 짰습니다.
    const items = [];
    const seen = new Set();

    const CODE_KEYS = ["cd", "code", "itemCode", "stockCode", "symbolCode"];
    const NAME_KEYS = ["nm", "name", "itemName", "korName", "stockName", "hangeulName"];

    function fromObject(node) {
      let code = null;
      let name = null;
      for (const k of CODE_KEYS) {
        if (typeof node[k] === "string" && /^\d{6}$/.test(node[k])) {
          code = node[k];
          break;
        }
      }
      for (const k of NAME_KEYS) {
        if (typeof node[k] === "string" && node[k]) {
          name = node[k];
          break;
        }
      }
      return code && name ? { code, name } : null;
    }

    function walk(node) {
      if (Array.isArray(node)) {
        // 배열 형태의 leaf: [code, name, ...]
        if (
          node.length >= 2 &&
          typeof node[0] === "string" &&
          /^\d{6}$/.test(node[0]) &&
          typeof node[1] === "string"
        ) {
          if (!seen.has(node[0])) {
            seen.add(node[0]);
            items.push({ code: node[0], name: node[1] });
          }
          return;
        }
        node.forEach(walk);
        return;
      }
      if (node && typeof node === "object") {
        const found = fromObject(node);
        if (found) {
          if (!seen.has(found.code)) {
            seen.add(found.code);
            items.push(found);
          }
          return;
        }
        Object.keys(node).forEach((k) => walk(node[k]));
      }
    }
    walk(data);

    if (!items.length) {
      // 파싱에 실패해도 원본 응답(raw)을 그대로 내려줘서, 브라우저
      // 개발자도구 네트워크 탭에서 실제 응답 구조를 바로 확인할 수 있게 함.
      res.status(200).json({ ok: false, error: "no matches (or upstream shape changed)", raw: data, items: [] });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ ok: true, items: items.slice(0, 8) });
  } catch (err) {
    res.status(200).json({ ok: false, error: String((err && err.message) || err) });
  }
};
