# Plan: ship a walking skeleton first, then layer features. You own orchestrator. Teammate owns crawler

## Definition of done

* `POST /campaigns` creates campaigns.
* `POST /campaigns/:id/discover` writes `profiles_raw` and `profile_features`.
* `POST /campaigns/:id/qualify` writes `llm_scores` and `leads`.
* `GET /campaigns/:id/leads` returns items.
* No full table scans. Logs show only targeted maintenance jobs.

## Work split

### You — Orchestrator (API, queues, DB)

1. **Migrations online**

   * Apply Prisma schema and generate client.
   * Seed one campaign with simple criteria.

2. **Queues and scheduler**

   * BullMQ queues: `crawl`, `qualify`, `dispatch`.
   * Repeatables:

     * `crawl.refresh` every 15m.
     * `qualify.campaign` daily per campaign.
     * `dispatch.dm` hourly.
   * Group rate limit keys per account.

3. **Candidate maintenance**

   * Compile criteria JSON to SQL WHERE and store `criteria_hash`.
   * Implement two queries:

     * Upsert in-bounds to `campaign_candidates`.
     * Delete out-of-bounds from `campaign_candidates`.

4. **Qualification worker**

   * Shortlist K from `campaign_candidates` joined to `profile_features`.
   * Cache key: `(campaign_id, username, profile_hash, criteria_hash)`.
   * Call local LLM. Require JSON output. Upsert `llm_scores`, then `leads`.

5. **Read API**

   * `GET /campaigns/:id/leads`
   * `GET /jobs/:id`

### Teammate — Crawler (Python)

1. **FastAPI endpoints**

   * `POST /crawl/jobs` accepts `{ seed_type, seed_value, crawl_config }`.
   * Background task runs crawl.

2. **Write path**

   * Compute `content_hash`.
   * Upsert `profiles_raw` with `payload`, `last_seen`, `content_hash`.
   * Enrich minimal `profile_features` and copy `version_hash = content_hash`.

3. **HTTP layer**

   * Central retry, proxy slot, headers. Bounded asyncio pool.
   * Fake scraper first. Swap in real fetchers next.

## Execution order

1. **Project bring-up**

```bash
cp .env.example .env
docker compose up -d postgres redis ollama
cd apps/api && bun install && bunx prisma generate && bunx prisma migrate dev --name init
bun run dev  # in one terminal
bun run queue:worker  # in another
```

```bash
cd apps/crawler
uv sync
uv run fastapi dev app/main.py
```

2. **Walking skeleton**

* Create campaign. `POST /campaigns`.
* Discover. `POST /campaigns/:id/discover` enqueues crawl job.
* Crawler writes 5 to 10 fake profiles per seed.
* Qualify. `POST /campaigns/:id/qualify` writes dummy `llm_scores` and `leads`.
* List leads. `GET /campaigns/:id/leads`.

3. **Real data**

* Replace fake scraper with real fetch using `curl_cffi`.
* Fill `profile_features` fields you need for the predicate.

## Concrete tasks to open (small PRs)

**Orchestrator**

* API routes scaffold and health.
* Prisma migrations v1.
* Queue boot and repeatables.
* Predicate compiler and maintenance queries.
* Qualification worker with LLM call and cache.
* Leads endpoint with pagination.
* Dispatch skeleton and feedback tables.

**Crawler**

* FastAPI app and health.
* Content hash + upsert logic.
* Enrichment v1.
* Real fetcher for one seed type.
* Configurable concurrency and backoff.

## LLM call shape (Node, local model)

```ts
// shortlist loop
const body = { model: "llama3.1", prompt, format: "json" };
const r = await fetch(`${process.env.OLLAMA_BASE_URL}/api/generate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const { response } = await r.json(); // JSON string
const out = JSON.parse(response); // { qualified, score, confidence, reasons }
```

Prompt includes criteria JSON, profile text, and up to 3 image URLs. Reject non JSON.

## Candidate SQL snippets you need today

* **Insert or refresh in-bounds**

```sql
INSERT INTO campaign_candidates AS cc(campaign_id, username, candidate_score_cheap, updated_at)
SELECT $1, pf.username, cheap_score(pf.*), now()
FROM profile_features pf
WHERE /* compiled WHERE for $1 */
ON CONFLICT (campaign_id, username)
DO UPDATE SET candidate_score_cheap = EXCLUDED.candidate_score_cheap, updated_at = now();
```

* **Evict out-of-bounds**

```sql
DELETE FROM campaign_candidates cc
USING profile_features pf
WHERE cc.campaign_id = $1
  AND pf.username = cc.username
  AND NOT (/* compiled WHERE for $1 */);
```

## Daily rhythm

* Morning: pick the smallest E2E gap. Ship one PR each.
* Afternoon: integrate and run the walking skeleton end to end.
* Evening: add one reliability lever. Retries, backoff, or a missing index.

## Review checklist for each PR

* Types pass and lint passes.
* Prisma migrate applied locally.
* No file > 400 lines. No function > 80 lines.
* Logs include job id and campaign id.
* No unbounded loops or unbounded concurrency.

## Risks and cut lines

* If the predicate is not ready, run LLM on a small random slice and log results for prompt tuning.
* If the real scraper stalls, keep fake producer to validate the pipeline.
* If local LLM is unstable, gate behind a flag and record payloads for replay.

## End-to-end test script

1. Create campaign with criteria.
2. Discover with a seed. Verify `profiles_raw` and `profile_features`.
3. Qualify. Verify `llm_scores` and `leads`.
4. Re run qualify with no changes. Verify no new `llm_scores` written.
5. Change criteria. Verify `campaign_candidates` changes then new `llm_scores`.

Stay on the walking skeleton until it is stable. Add speed and accuracy after that.
