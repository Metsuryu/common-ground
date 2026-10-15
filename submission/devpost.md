# Devpost submission draft — Common Ground

**Tagline:** Different tastes, one plan. An agent that finds what *everyone* in a group will love.
**Demo:** https://common-ground-agent.truecost.workers.dev
**Repo:** https://github.com/Metsuryu/common-ground
**Built with:** qloo, cloudflare-workers, workers-ai, llama, javascript

## Inspiration
Every group plan dies in the same chat thread: "I don't mind, you choose." Recommenders are built for one person, so groups default to the loudest person's taste or the safest chain. Qloo knows how tastes relate *across* domains — music to restaurants, films to bars — which means it can do something a single-user recommender can't: find the overlap between people who like completely different things.

## What it does
You describe the group in one sentence — who's coming, what each person loves, where and what occasion. Common Ground:
- maps each person's taste to real Qloo entities,
- scores every candidate restaurant / bar / café in the city **separately for each person**,
- ranks them by **fairness** (the score of the least-happy person, not the average),
- finds a film and a soundtrack that bridge everyone's tastes,
- writes a short plan that says *why* each stop works for *each* person, and flags compromises honestly.
Every agent step streams live, and each venue shows a per-person affinity bar so you can see it's fair. You can also **Copy share link** (`?q=` on the URL) so a friend opens the same brief without retyping.

## How we built it
A single Cloudflare Worker. Llama 3.3 70B on Workers AI parses the free text into a structured brief (people, typed likes, city, stops). The agent then calls Qloo `/search` to resolve each like, `/v2/insights` once per person per stop (place type + genre tag + location + that person's entity signals), intersects the lists and applies a maximin ranking, then calls Insights for movies and artists with combined signals. The LLM writes the final plan grounded only in Qloo's results. The Qloo key stays a Worker secret; responses are cached privately with the Cache API, and calls go through a serial queue with exponential backoff. Rate-limit and slow-path errors surface as plain retry tips in the UI.

## Challenges we ran into
- **Rate limits:** parallel per-person queries hit 429s, so I built a serial queue with backoff plus a private cache — the second run of a group is near-instant.
- **"Restaurant" isn't always a restaurant:** genre-tag filters returned malls and bartending schools, so results are filtered by Qloo's `primary_genre`.
- **Hallucination:** early plans invented venues when data was thin; the planner prompt now only allows entities present in the facts, and the agent falls back to a joint-signal query when there's no overlap.
- **Entity typing:** "Studio Ghibli" or "Hamilton" are ambiguous; the agent does a typed search then an untyped fallback.

## Accomplishments that we're proud of
A fairness-first recommender that is transparent: you can see each person's match for every pick, and the explanation ties back to their own tastes. Shareable `?q=` links make it easy to hand a brief to a friend.

## What we learned
Cross-domain taste signals are strongest when you keep people separate and combine late — merging everyone's likes into one query quietly favors whoever has the most mainstream taste.

## What's next
Each friend adding their own likes on a shared link, more stop types (museums, concerts via `urn:entity:place` tags), budget and opening-hours constraints, and a WhatsApp/Telegram bot front end.

## Testing instructions
Open the demo, click an example chip (or write your own group), press **Find our common ground**. A run takes ~20–40 s on first use (cached afterwards). No login needed. Optional: use **Copy share link** and open the URL in a private window to confirm the brief preloads.
