# Common Ground — agents, but with taste (for groups)

**Live demo:** https://common-ground-agent.truecost.workers.dev

Describe a group in plain words ("Date night in Rome — I love Radiohead and Wes Anderson, she loves Taylor Swift and The Devil Wears Prada"). Common Ground is an agent that maps **each person's** taste with the **Qloo Taste AI** APIs, finds venues, a film and a soundtrack that work for **everyone**, and writes a plan explaining why each stop fits each person.

## How the agent works
1. **Understand** — Llama 3.3 70B (Cloudflare Workers AI) turns free text into a structured brief: people, their likes (typed as artist / movie / tv_show / book / videogame / brand / place …), city, occasion and which stops are needed (dinner, drinks, coffee).
2. **Resolve** — every like is resolved to a real Qloo entity via `GET /search` (typed first, untyped fallback).
3. **Score per person** — for each stop, one `GET /v2/insights` call **per person** (`filter.type=urn:entity:place`, `filter.tags`, `filter.location.query`, `signal.interests.entities`). Results are filtered by `primary_genre` so a "dinner" is really a restaurant.
4. **Fairness ranking** — candidates are intersected across people and ranked by **maximin**: a place is only as good as its affinity for the *least-served* person (tie-break: mean). If there's no overlap the agent falls back to a joint-signal Insights query and says so.
5. **Cross-domain bridges** — Insights for `urn:entity:movie` and `urn:entity:artist` using everyone's signals combined → a film to watch together and a shared playlist seed.
6. **Explain** — the LLM writes the plan grounded **only** in Qloo results (no invented venues), naming who each stop is for and flagging compromises.

The UI streams every agent step live (NDJSON) and shows per-person affinity bars for each venue.

## Run / deploy
```bash
npm install
npx wrangler secret put QLOO_API_KEY   # hackathon key, server-side only
npx wrangler deploy
```
Requires a Cloudflare account (Workers AI binding `AI` is free-tier friendly). Qloo responses are cached privately in the Workers Cache API (never committed) and Qloo calls go through a serial queue with retry/backoff to respect rate limits.

## Stack
Cloudflare Workers · Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) · Qloo `/search` + `/v2/insights` · vanilla HTML/JS. MIT licensed.
