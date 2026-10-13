// Common Ground — a taste-bridging agent built on Qloo Taste AI + Workers AI.
// Given 2–5 people with different tastes, it finds the places, films and music
// that ALL of them are likely to love, and plans a shared outing with reasons.
import { PAGE } from "./page.js";

const QLOO = "https://hackathon.api.qloo.com";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const TYPES = ["artist","movie","tv_show","book","brand","place","video_game","podcast","destination","person"];
const VENUES = {
  dinner: { tag: "urn:tag:genre:place:restaurant", label: "Dinner", ok: /restaurant:(?!bar|cafe|coffee|espresso|bakery)/ },
  drinks: { tag: "urn:tag:genre:place:restaurant:bar", label: "Drinks", ok: /(bar|pub|brewery|wine|cocktail|lounge)/ },
  coffee: { tag: "urn:tag:genre:place:restaurant:cafe", label: "Coffee", ok: /(cafe|coffee|espresso|bakery|tea)/ },
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/health") return json({ ok: true, qloo: !!env.QLOO_API_KEY, ai: !!env.AI });
    if (url.pathname === "/api/plan" && req.method === "POST") {
      let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
      const text = String(body.text || "").slice(0, 2000);
      if (text.length < 10) return json({ error: "Describe the group first." }, 400);
      // Stream the agent trace + result as NDJSON so the user sees each step live.
      const { readable, writable } = new TransformStream();
      const w = writable.getWriter(); const enc = new TextEncoder();
      const emit = (o) => w.write(enc.encode(JSON.stringify(o) + "\n"));
      (async () => {
        try { await runAgent(text, env, emit); }
        catch (e) { await emit({ type: "error", message: String(e && e.message || e) }); }
        finally { await w.close(); }
      })();
      return new Response(readable, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
    }
    return new Response("Not found", { status: 404 });
  },
};

function json(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } }); }

// Qloo calls go through a tiny serial queue with retry/backoff: the hackathon key is rate-limited.
let chain = Promise.resolve();
function qloo(env, path, params) {
  const run = () => qlooRaw(env, path, params);
  const p = chain.then(run, run); chain = p.catch(() => {}); return p;
}
async function qlooRaw(env, path, params) {
  const u = new URL(QLOO + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, v);
  const cache = caches.default, key = new Request(u.toString());
  const hit = await cache.match(key); if (hit) return hit.json();
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(u, { headers: { "X-Api-Key": env.QLOO_API_KEY } });
    if (r.ok) {
      const body = await r.text();
      await cache.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": "max-age=86400" } }));
      return JSON.parse(body);
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 5) { await new Promise(res => setTimeout(res, 1000 * 2 ** attempt)); continue; }
    console.log("qloo", path, r.status); throw new Error(`Qloo ${path} ${r.status}`);
  }
}

async function llm(env, system, user, max_tokens = 900) {
  const r = await env.AI.run(MODEL, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens, temperature: 0.4 });
  return (r && (r.response ?? r.result?.response)) || "";
}
function extractJSON(s) {
  if (typeof s === "object") return s;
  const m = s.match(/\{[\s\S]*\}/); if (!m) throw new Error("Planner did not return JSON");
  return JSON.parse(m[0]);
}

async function runAgent(text, env, emit) {
  // STEP 1 — the LLM understands the request and extracts a structured brief.
  await emit({ type: "step", id: "parse", label: "Understanding the group", status: "run" });
  const sys = `You extract a structured brief for a group-outing planner. Output ONLY JSON:
{"city":string,"occasion":string,"venues":["dinner"|"drinks"|"coffee"],"want_movie":bool,"want_music":bool,
 "people":[{"name":string,"likes":[{"name":string,"type":one of ${JSON.stringify(TYPES)}}]}]}
Rules: 2-5 people, max 5 likes each, keep the exact titles/names they mention, pick the most plausible type.
If no city is given use "New York". venues: what the occasion needs (default ["dinner","drinks"]).`;
  const brief = extractJSON(await llm(env, sys, text, 700));
  brief.people = (brief.people || []).slice(0, 5).map((p) => ({ name: String(p.name || "Someone"), likes: (p.likes || []).filter(l => l && l.name).slice(0, 5).map(l => ({ name: String(l.name), type: TYPES.includes(l.type) ? l.type : "movie" })) })).filter(p => p.likes.length);
  if (brief.people.length < 2) throw new Error("I need at least two people with at least one thing each likes.");
  brief.venues = (brief.venues || ["dinner", "drinks"]).filter(v => VENUES[v]).slice(0, 3);
  if (!brief.venues.length) brief.venues = ["dinner", "drinks"];
  await emit({ type: "step", id: "parse", status: "done", detail: `${brief.people.length} people · ${brief.city} · ${brief.occasion || "outing"}`, data: brief });

  // STEP 2 — resolve every taste to a real Qloo entity (Qloo /search).
  await emit({ type: "step", id: "resolve", label: "Resolving tastes with Qloo Search", status: "run" });
  await Promise.all(brief.people.flatMap(p => p.likes.map(async (l) => {
    try {
      const d = await qloo(env, "/search", { query: l.name, types: `urn:entity:${l.type === "video_game" ? "videogame" : l.type}`, take: 1 });
      let hit = d.results?.[0];
      if (!hit) { const d2 = await qloo(env, "/search", { query: l.name, take: 1 }); hit = d2.results?.[0]; }
      if (hit) { l.id = hit.entity_id; l.resolved = hit.name; l.image = hit.properties?.image?.url; l.tags = (hit.tags || []).slice(0, 4).map(t => t.name); }
    } catch (e) { l.err = String(e.message); }
  })));
  for (const p of brief.people) p.ids = p.likes.filter(l => l.id).map(l => l.id);
  const people = brief.people.filter(p => p.ids.length);
  if (people.length < 2) throw new Error("Qloo couldn't match enough of those tastes — try more well-known titles or artists.");
  await emit({ type: "step", id: "resolve", status: "done", detail: people.map(p => `${p.name}: ${p.likes.filter(l=>l.id).map(l => l.resolved).join(", ")}`).join(" | "), data: people.map(p => ({ name: p.name, likes: p.likes })) });

  // STEP 3 — per-person taste profiles + fairness-ranked shared venues (Qloo Insights).
  await emit({ type: "step", id: "venues", label: `Scoring ${brief.city} venues against each person's taste`, status: "run" });
  const venueResults = {}; const errs = []; const used = new Set();
  for (const v of brief.venues) {
    const per = await Promise.all(people.map(p => qloo(env, "/v2/insights", { "filter.type": "urn:entity:place", "filter.tags": VENUES[v].tag, "filter.location.query": brief.city, "signal.interests.entities": p.ids.join(","), take: 40 }).then(d => d.results?.entities || []).catch((e) => { errs.push(String(e.message)); return []; })));
    const map = new Map();
    per.forEach((list, i) => list.filter(e => VENUES[v].ok.test(e.properties?.primary_genre?.id || "")).forEach((e, rank) => {
      if (!map.has(e.entity_id)) map.set(e.entity_id, { e, scores: Array(people.length).fill(null) });
      map.get(e.entity_id).scores[i] = e.query?.affinity ?? (1 - rank / 40);
    }));
    // Fairness score: a place is only as good as it is for the LEAST-served person (maximin), tie-break by mean.
    let ranked = [...map.values()].filter(x => !used.has(x.e.entity_id) && x.scores.every(s => s !== null))
      .map(x => ({ ...x, min: Math.min(...x.scores), mean: x.scores.reduce((a, b) => a + b, 0) / x.scores.length }))
      .sort((a, b) => b.min - a.min || b.mean - a.mean);
    let mode = "shared";
    if (ranked.length < 3) { // fall back to a joint signal query
      const d = await qloo(env, "/v2/insights", { "filter.type": "urn:entity:place", "filter.tags": VENUES[v].tag, "filter.location.query": brief.city, "signal.interests.entities": people.flatMap(p => p.ids).join(","), take: 30 }).catch(() => null);
      ranked = (d?.results?.entities || []).filter(e => VENUES[v].ok.test(e.properties?.primary_genre?.id || "")).map(e => ({ e, scores: people.map(() => e.query?.affinity ?? 0), min: e.query?.affinity ?? 0, mean: e.query?.affinity ?? 0 }));
      mode = "joint";
    }
    ranked.slice(0, 3).forEach(x => used.add(x.e.entity_id));
    venueResults[v] = { label: VENUES[v].label, mode, items: ranked.slice(0, 3).map(x => slimPlace(x, people)) };
  }
  await emit({ type: "step", id: "venues", status: "done", detail: Object.values(venueResults).map(r => `${r.label}: ${r.items.map(i => i.name).join(", ") || "none"}`).join(" | "), data: venueResults, errors: errs });

  // STEP 4 — cross-domain bridges: a film and music everyone shares.
  const bridges = {};
  const all = people.flatMap(p => p.ids).join(",");
  const jobs = [];
  if (true) jobs.push(["movie", "urn:entity:movie"]);
  if (true) jobs.push(["music", "urn:entity:artist"]);
  if (jobs.length) {
    await emit({ type: "step", id: "bridges", label: "Finding cross-domain taste bridges (film + music)", status: "run" });
    await Promise.all(jobs.map(async ([k, t]) => {
      const d = await qloo(env, "/v2/insights", { "filter.type": t, "signal.interests.entities": all, take: 8 }).catch(() => null);
      const own = new Set(people.flatMap(p => p.ids));
      bridges[k] = (d?.results?.entities || []).filter(e => !own.has(e.entity_id)).slice(0, 4).map(e => ({ name: e.name, affinity: e.query?.affinity, image: e.properties?.image?.url, year: e.properties?.release_year, tags: (e.tags || []).slice(0, 3).map(t => t.name) }));
    }));
    await emit({ type: "step", id: "bridges", status: "done", detail: Object.entries(bridges).map(([k, v]) => `${k}: ${v.map(x => x.name).join(", ")}`).join(" | "), data: bridges });
  }

  // STEP 5 — the LLM writes the plan, grounded ONLY in Qloo's results.
  await emit({ type: "step", id: "plan", label: "Writing the plan", status: "run" });
  const facts = { city: brief.city, occasion: brief.occasion, people: people.map(p => ({ name: p.name, likes: p.likes.filter(l => l.id).map(l => l.resolved) })), venues: venueResults, bridges };
  const planSys = `You are Common Ground, a warm, concise outing planner. Use ONLY venues/films/artists in the FACTS (never invent places).
Write in English, markdown, max 220 words: a catchy title (### ), a short timeline for the outing (one bullet per stop, venue name in bold + neighborhood),
and for each stop one line "Why it works:" that names specific people and connects to THEIR stated tastes and the venue's tags.
End with a one-line "Conversation starter:" that uses a shared film or artist. Per-person affinity scores are 0-1; mention if a stop is a compromise.`;
  const plan = await llm(env, planSys, "FACTS:\n" + JSON.stringify(facts), 700);
  await emit({ type: "step", id: "plan", status: "done", detail: "done" });
  await emit({ type: "result", plan, facts });
}

function slimPlace(x, people) {
  const p = x.e.properties || {};
  return {
    name: x.e.name, kind: p.primary_genre?.name, address: p.address, neighborhood: p.geocode?.name || p.neighborhood, price: p.price_level, rating: p.business_rating,
    image: p.images?.[0]?.url || p.image?.url, website: p.website,
    desc: (p.short_description || p.overall_description || p.ambience_description || "").slice(0, 220),
    tags: (x.e.tags || []).slice(0, 6).map(t => t.name),
    fairness: +x.min.toFixed(3), perPerson: people.map((pp, i) => ({ name: pp.name, affinity: x.scores[i] == null ? null : +x.scores[i].toFixed(3) })),
  };
}
