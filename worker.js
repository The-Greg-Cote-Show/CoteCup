// ============================================================
// Cote Cup 2026 — Cloudflare Worker v2
// Smart schedule-aware polling — zero requests outside match windows
// One API call per cycle pulls everything: live, completed, upcoming
// ============================================================

const API_BASE  = "https://api.football-data.org/v4";

const COMPETITION = "WC";
const MATCH_DURATION_MS = 3.5 * 60 * 60 * 1000; // 3.5 hours per match window

// ── FULL TOURNAMENT SCHEDULE ──────────────────────────────────────────────────
// Each entry is [YYYY-MM-DD, kickoff_utc_hour, kickoff_utc_minute]
// Source: FIFA official schedule, verified via Al Jazeera / ESPN
const SCHEDULE = [
  ["2026-06-11", 19,  0],  // Mexico vs South Africa
  ["2026-06-12",  2,  0],  // South Korea vs Czechia
  ["2026-06-12", 19,  0],  // Canada vs Bosnia
  ["2026-06-13",  1,  0],  // USA vs Paraguay
  ["2026-06-13", 19,  0],  // Qatar vs Switzerland
  ["2026-06-13", 22,  0],  // Brazil vs Morocco
  ["2026-06-14",  1,  0],  // Haiti vs Scotland
  ["2026-06-14",  4,  0],  // Australia vs Turkiye
  ["2026-06-14", 17,  0],  // Germany vs Curacao
  ["2026-06-14", 20,  0],  // Netherlands vs Japan
  ["2026-06-14", 23,  0],  // Ivory Coast vs Ecuador
  ["2026-06-15",  2,  0],  // Sweden vs Tunisia
  ["2026-06-15", 16,  0],  // Spain vs Cape Verde
  ["2026-06-15", 19,  0],  // Belgium vs Egypt
  ["2026-06-15", 22,  0],  // Saudi Arabia vs Uruguay
  ["2026-06-16",  1,  0],  // Iran vs New Zealand
  ["2026-06-16", 19,  0],  // France vs Senegal
  ["2026-06-16", 22,  0],  // Iraq vs Norway
  ["2026-06-17",  1,  0],  // Argentina vs Algeria
  ["2026-06-17",  4,  0],  // Austria vs Jordan
  ["2026-06-17", 17,  0],  // Portugal vs DR Congo
  ["2026-06-17", 20,  0],  // England vs Croatia
  ["2026-06-17", 23,  0],  // Ghana vs Panama
  ["2026-06-18",  2,  0],  // Uzbekistan vs Colombia
  ["2026-06-18", 16,  0],  // Czechia vs South Africa
  ["2026-06-18", 19,  0],  // Switzerland vs Bosnia
  ["2026-06-18", 22,  0],  // Canada vs Qatar
  ["2026-06-19",  1,  0],  // Mexico vs South Korea
  ["2026-06-19", 19,  0],  // USA vs Australia
  ["2026-06-19", 22,  0],  // Scotland vs Morocco
  ["2026-06-20",  0, 30],  // Brazil vs Haiti
  ["2026-06-20",  4,  0],  // Turkiye vs Paraguay
  ["2026-06-20", 17,  0],  // Netherlands vs Sweden
  ["2026-06-20", 20,  0],  // Germany vs Ivory Coast
  ["2026-06-21",  0,  0],  // Ecuador vs Curacao
  ["2026-06-21",  4,  0],  // Tunisia vs Japan
  ["2026-06-21", 16,  0],  // Spain vs Saudi Arabia
  ["2026-06-21", 19,  0],  // Belgium vs Iran
  ["2026-06-21", 22,  0],  // Uruguay vs Cape Verde
  ["2026-06-22",  1,  0],  // New Zealand vs Egypt
  ["2026-06-22", 17,  0],  // Argentina vs Austria
  ["2026-06-22", 21,  0],  // France vs Iraq
  ["2026-06-23",  1,  0],  // Norway vs Senegal
  ["2026-06-23",  3,  0],  // Jordan vs Algeria
  ["2026-06-23", 17,  0],  // Portugal vs Uzbekistan
  ["2026-06-23", 20,  0],  // England vs Ghana
  ["2026-06-23", 23,  0],  // Panama vs Croatia
  ["2026-06-24",  2,  0],  // Colombia vs DR Congo
  ["2026-06-24", 19,  0],  // Switzerland vs Canada
  ["2026-06-24", 19,  0],  // Bosnia vs Qatar
  ["2026-06-24", 22,  0],  // Scotland vs Brazil
  ["2026-06-24", 22,  0],  // Morocco vs Haiti
  ["2026-06-25",  1,  0],  // Czechia vs Mexico
  ["2026-06-25",  1,  0],  // South Africa vs South Korea
  ["2026-06-25", 20,  0],  // Ecuador vs Germany
  ["2026-06-25", 20,  0],  // Curacao vs Ivory Coast
  ["2026-06-25", 23,  0],  // Japan vs Sweden
  ["2026-06-25", 23,  0],  // Tunisia vs Netherlands
  ["2026-06-26",  2,  0],  // Turkiye vs USA
  ["2026-06-26",  2,  0],  // Paraguay vs Australia
  ["2026-06-26", 19,  0],  // Norway vs France
  ["2026-06-26", 19,  0],  // Senegal vs Iraq
  ["2026-06-27",  1,  0],  // New Zealand vs Belgium
  ["2026-06-27",  1,  0],  // Egypt vs Iran
  ["2026-06-27",  3,  0],  // Cape Verde vs Saudi Arabia
  ["2026-06-27",  3,  0],  // Uruguay vs Spain
  ["2026-06-27", 21,  0],  // Panama vs England
  ["2026-06-27", 21,  0],  // Croatia vs Ghana
  ["2026-06-27", 23, 30],  // Colombia vs Portugal
  ["2026-06-27", 23, 30],  // DR Congo vs Uzbekistan
  ["2026-06-28",  2,  0],  // Algeria vs Austria
  ["2026-06-28",  2,  0],  // Jordan vs Argentina
  ["2026-06-28", 19,  0],  // R32 Match 1
  ["2026-06-29", 17,  0],  // R32 Match 2
  ["2026-06-29", 20, 30],  // R32 Match 3
  ["2026-06-30",  1,  0],  // R32 Match 4
  ["2026-06-30", 17,  0],  // R32 Match 5
  ["2026-06-30", 21,  0],  // R32 Match 6
  ["2026-07-01",  1,  0],  // R32 Match 7
  ["2026-07-01", 16,  0],  // R32 Match 8
  ["2026-07-01", 20,  0],  // R32 Match 9
  ["2026-07-02",  0,  0],  // R32 Match 10
  ["2026-07-02", 19,  0],  // R32 Match 11
  ["2026-07-02", 23,  0],  // R32 Match 12
  ["2026-07-03",  3,  0],  // R32 Match 13
  ["2026-07-03", 18,  0],  // R32 Match 14
  ["2026-07-03", 22,  0],  // R32 Match 15
  ["2026-07-04",  1, 30],  // R32 Match 16
  ["2026-07-04", 17,  0],  // R16 Match 1
  ["2026-07-04", 21,  0],  // R16 Match 2
  ["2026-07-05", 20,  0],  // R16 Match 3
  ["2026-07-06",  0,  0],  // R16 Match 4
  ["2026-07-06", 19,  0],  // R16 Match 5
  ["2026-07-07",  0,  0],  // R16 Match 6
  ["2026-07-07", 16,  0],  // R16 Match 7
  ["2026-07-07", 20,  0],  // R16 Match 8
  ["2026-07-09", 20,  0],  // QF Match 1
  ["2026-07-10", 19,  0],  // QF Match 2
  ["2026-07-11", 21,  0],  // QF Match 3
  ["2026-07-12",  1,  0],  // QF Match 4
  ["2026-07-14", 19,  0],  // Semifinal 1
  ["2026-07-15", 19,  0],  // Semifinal 2
  ["2026-07-18", 19,  0],  // Third Place
  ["2026-07-19", 19,  0],  // Final
];

// ── CORS ─────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Convert schedule entry to UTC timestamp in ms
function kickoffToMs(dateStr, hour, minute) {
  return Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(5, 7)) - 1,
    parseInt(dateStr.slice(8, 10)),
    hour,
    minute,
    0
  );
}

// Is right now inside any match window?
// A window = kickoff time to kickoff + MATCH_DURATION_MS
function isMatchWindow(nowMs) {
  for (const [date, h, m] of SCHEDULE) {
    const ko = kickoffToMs(date, h, m);
    if (nowMs >= ko && nowMs <= ko + MATCH_DURATION_MS) {
      return true;
    }
  }
  return false;
}

// How many ms until the next match window opens?
function msUntilNextWindow(nowMs) {
  let nearest = Infinity;
  for (const [date, h, m] of SCHEDULE) {
    const ko = kickoffToMs(date, h, m);
    if (ko > nowMs) {
      nearest = Math.min(nearest, ko - nowMs);
    }
  }
  return nearest;
}

// ── API FETCH ─────────────────────────────────────────────────────────────────
async function fetchAllFixtures(env) {
  const url = `${API_BASE}/competitions/${COMPETITION}/matches`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": env.FOOTBALL_DATA_KEY },
  });
  const raw = await res.text();
  console.log("API status:", res.status, "body:", raw.slice(0, 500));
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = JSON.parse(raw);
  const all = data.matches || [];

  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const yd    = new Date(now - 86400000).toISOString().slice(0, 10);
  const tm    = new Date(+now + 86400000).toISOString().slice(0, 10);

  return {
    live:      all.filter(f => ["IN_PLAY","PAUSED","LIVE"].includes(f.status)),
    today:     all.filter(f => f.utcDate.slice(0, 10) === today),
    yesterday: all.filter(f => f.utcDate.slice(0, 10) === yd),
    tomorrow:  all.filter(f => f.utcDate.slice(0, 10) === tm),
    completed: all.filter(f => f.status === "FINISHED"),
    all:       all,  // Full fixture list for client-side date bucketing
  };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    if (url.pathname === "/debug") {
      const nowMs = Date.now();
      return new Response(JSON.stringify({
        hasKey: !!env.FOOTBALL_DATA_KEY,
        keyLength: (env.FOOTBALL_DATA_KEY||"").length,
        inWindow: isMatchWindow(nowMs),
        nowUTC: new Date(nowMs).toISOString()
      }), { headers: CORS });
    }

    // Manual refresh — forces a fresh API call regardless of window
    if (url.pathname === "/refresh") {
      try {
        const fixtures = await fetchAllFixtures(env);
        const payload  = { updated: new Date().toISOString(), fixtures };
        await env.COTECUP_CACHE.put("payload", JSON.stringify(payload), { expirationTtl: 3600 });
        return new Response(JSON.stringify({
          ok: true, updated: payload.updated,
          counts: { live: fixtures.live.length, today: fixtures.today.length, completed: fixtures.completed.length }
        }), { headers: CORS });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    if (url.pathname === "/data") {
      try {
        const nowMs    = Date.now();
        const inWindow = isMatchWindow(nowMs);

        // Try cache first
        let cached = null;
        try { cached = await env.COTECUP_CACHE.get("payload", "json"); } catch (_) {}

        // In window with no cache — fetch fresh
        if (inWindow && !cached) {
          const fixtures = await fetchAllFixtures(env);
          const payload  = { updated: new Date().toISOString(), fixtures };
          try { await env.COTECUP_CACHE.put("payload", JSON.stringify(payload), { expirationTtl: 60 }); } catch (_) {}
          return new Response(JSON.stringify(payload), { headers: CORS });
        }

        // Have cache — serve it
        if (cached) {
          return new Response(JSON.stringify(cached), { headers: CORS });
        }

        // Outside window, no cache — fetch once and store for 12 hours
        // This prevents the site going blank between match windows
        try {
          const fixtures = await fetchAllFixtures(env);
          const payload  = { updated: new Date().toISOString(), fixtures };
          await env.COTECUP_CACHE.put("payload", JSON.stringify(payload), { expirationTtl: 43200 });
          return new Response(JSON.stringify(payload), { headers: CORS });
        } catch (err) {
          return new Response(JSON.stringify({
            updated: new Date().toISOString(),
            fixtures: { live: [], today: [], yesterday: [], tomorrow: [], completed: [] },
            idle: true,
            nextWindow: msUntilNextWindow(nowMs),
          }), { headers: CORS });
        }

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
      }
    }

    return new Response("Not found", { status: 404 });
  },

  // Scheduled handler — the only thing that ever calls the API
  // Two modes:
  // 1. During match windows (cron */6 * * * *): live polling every 6 minutes
  // 2. Daily catch-up at 06:00 UTC: one fetch to store all completed results
  async scheduled(event, env, ctx) {
    const nowMs = Date.now();
    const nowUTC = new Date(nowMs);
    const hour = nowUTC.getUTCHours();
    const minute = nowUTC.getUTCMinutes();

    // Daily catch-up: runs at 06:00 UTC regardless of match window
    // This ensures completed results from overnight matches are always stored
    const isCatchUp = (hour === 6 && minute < 10);

    if (!isMatchWindow(nowMs) && !isCatchUp) {
      console.log(`Outside match window — skipping. Next window in ${Math.round(msUntilNextWindow(nowMs) / 60000)} min`);
      return;
    }

    try {
      const fixtures = await fetchAllFixtures(env);
      const payload  = { updated: new Date().toISOString(), fixtures };
      // During catch-up, use longer TTL so results persist all day
      const ttl = isCatchUp ? 3600 * 12 : 60;
      await env.COTECUP_CACHE.put("payload", JSON.stringify(payload), {
        expirationTtl: ttl,
      });
      console.log(`Cache refreshed at ${payload.updated} — mode: ${isCatchUp ? "catch-up" : "live"} — completed: ${fixtures.completed.length}, live: ${fixtures.live.length}`);
    } catch (err) {
      console.error("Scheduled refresh failed:", err.message);
    }
  },
};
