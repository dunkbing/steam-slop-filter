//   GET  /games?appids=1,2,3  -> { games: { "1": { slop, legit, ai, aiText } } }
//   POST /vote { appid, vote: 1 | -1 | 0, voter }  -> { score: { slop, legit } }

const MAX_APPIDS = 10;
const DISCLOSURE_TTL = 7 * 24 * 60 * 60 * 1000;
// Unreadable pages (age gate, region lock, Steam rate limit) are retried at most this often.
const RETRY_TTL = 60 * 60 * 1000;
const VOTERS_PER_IP_PER_APP = 3;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const limiter = request.method === "POST" ? env.VOTE_LIMITER : env.READ_LIMITER;
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (limiter && !(await limiter.limit({ key: ip })).success) {
      return json({ error: "too many requests" }, 429);
    }
    try {
      if (request.method === "GET" && url.pathname === "/games") return await games(url, env);
      if (request.method === "POST" && url.pathname === "/vote") return await vote(request, env);
      return json({ error: "not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "internal error" }, 500);
    }
  },
};

async function games(url, env) {
  const ids = [...new Set((url.searchParams.get("appids") || "").split(","))]
    .filter((s) => /^\d{1,10}$/.test(s))
    .slice(0, MAX_APPIDS)
    .map(Number);
  if (!ids.length) return json({ games: {} });

  const ph = ids.map(() => "?").join(",");
  const [votes, cached] = await env.DB.batch([
    env.DB.prepare(
      `SELECT appid, SUM(vote = 1) AS slop, SUM(vote = -1) AS legit
         FROM votes WHERE appid IN (${ph}) GROUP BY appid`
    ).bind(...ids),
    env.DB.prepare(`SELECT appid, ai, text, checked_at FROM disclosures WHERE appid IN (${ph})`).bind(...ids),
  ]);
  const voteRows = new Map(votes.results.map((r) => [r.appid, r]));
  const discRows = new Map(cached.results.map((r) => [r.appid, r]));

  const out = {};
  await Promise.all(
    ids.map(async (id) => {
      let d = discRows.get(id);
      if (!d || Date.now() - d.checked_at > (d.ai < 0 ? RETRY_TTL : DISCLOSURE_TTL)) {
        d = (await fetchDisclosure(id, env)) || d;
      }
      const v = voteRows.get(id);
      out[id] = {
        slop: v ? v.slop : 0,
        legit: v ? v.legit : 0,
        ai: d && d.ai >= 0 ? d.ai === 1 : null,
        aiText: d && d.ai === 1 ? d.text : "",
      };
    })
  );
  return json({ games: out });
}

async function fetchDisclosure(appid, env) {
  try {
    const res = await fetch(`https://store.steampowered.com/app/${appid}/?l=english`, {
      headers: { Cookie: "birthtime=0; lastagecheckage=1-0-1990; wants_mature_content=1" },
    });
    const d = res.ok ? parseDisclosure(await res.text()) : null;
    if (!d) return await markUnreadable(appid, env);
    const row = { ai: d.ai ? 1 : 0, text: d.text.slice(0, 1000), checked_at: Date.now() };
    await env.DB.prepare(
      `INSERT INTO disclosures (appid, ai, text, checked_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (appid) DO UPDATE
         SET ai = excluded.ai, text = excluded.text, checked_at = excluded.checked_at`
    )
      .bind(appid, row.ai, row.text, row.checked_at)
      .run();
    return row;
  } catch (err) {
    console.error("steam fetch failed", appid, err);
    return await markUnreadable(appid, env).catch(() => null);
  }
}

// New appid: store ai = -1 (unknown). Known appid: keep serving the stale result, retry in RETRY_TTL.
async function markUnreadable(appid, env) {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO disclosures (appid, ai, text, checked_at) VALUES (?1, -1, '', ?2)
     ON CONFLICT (appid) DO UPDATE
       SET checked_at = CASE WHEN ai < 0 THEN ?2 ELSE ?3 END`
  )
    .bind(appid, now, now - DISCLOSURE_TTL + RETRY_TTL)
    .run();
  return null;
}

// null = not a readable store page (age gate, error, region redirect).
export function parseDisclosure(html) {
  if (!html.includes('id="appHubAppName"')) return null;
  const m = html.match(/<h2>\s*AI Generated Content Disclosure\s*<\/h2>([\s\S]*?)<\/div>/i);
  if (!m) return { ai: false, text: "" };
  const italic = m[1].match(/<i>([\s\S]*?)<\/i>/i);
  const text = (italic ? italic[1] : m[1])
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { ai: true, text };
}

async function vote(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const appid = Number(body.appid);
  const value = Number(body.vote);
  const voter = String(body.voter || "");
  if (!Number.isInteger(appid) || appid <= 0) return json({ error: "bad appid" }, 400);
  if (![1, -1, 0].includes(value)) return json({ error: "bad vote" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(voter)) return json({ error: "bad voter" }, 400);

  if (value === 0) {
    await env.DB.prepare("DELETE FROM votes WHERE appid = ? AND voter = ?").bind(appid, voter).run();
  } else {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipHash = await sha256(ip + "|" + (env.IP_SALT || ""));
    const others = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM votes WHERE appid = ? AND ip_hash = ? AND voter <> ?"
    )
      .bind(appid, ipHash, voter)
      .first("n");
    if (others >= VOTERS_PER_IP_PER_APP) {
      return json({ error: "too many voters from this network for this game" }, 429);
    }
    await env.DB.prepare(
      `INSERT INTO votes (appid, voter, vote, ip_hash, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (appid, voter) DO UPDATE
         SET vote = excluded.vote, ip_hash = excluded.ip_hash, updated_at = excluded.updated_at`
    )
      .bind(appid, voter, value, ipHash, Date.now())
      .run();
  }

  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(vote = 1), 0) AS slop, COALESCE(SUM(vote = -1), 0) AS legit FROM votes WHERE appid = ?"
  )
    .bind(appid)
    .first();
  return json({ score: { slop: row.slop, legit: row.legit } });
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
