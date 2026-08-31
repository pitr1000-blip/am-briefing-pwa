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
      },
    });

    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: `upstream returned ${upstream.status}` });
      return;
    }

    const data = await upstream.json();

    // Known shape: { query, items: [ [ [code, name, ...], [code, name, ...] ] ] }
    // Defensive: walk whatever nested arrays we get and pull out anything
    // that looks like a 6-digit code + a name string.
    const items = [];
    const seen = new Set();

    function walk(node) {
      if (Array.isArray(node)) {
        // A "leaf" entry looks like [code, name, ...]
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
      }
    }
    walk(data && data.items);

    if (!items.length) {
      res.status(200).json({ ok: false, error: "no matches (or upstream shape changed)", raw: data, items: [] });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ ok: true, items: items.slice(0, 8) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
};
