# Omni MVP - Product Requirements Document

Version: 1.0

## 1. Problem and Goal

Teams need a fast system to discover, qualify, and message the right profiles daily. The current CLI is powerful but not service oriented. Goal: ship an MVP service that runs continuous crawl, incremental candidate maintenance, daily LLM qualification, and quota based dispatch with simple feedback loops.

## 2. Vision

Single click campaign runs daily. Each account sends up to 50 messages to the best candidates selected by a hybrid of cheap features and LLM judgment with optional vision input. The system scales to 1,000 users with one account each.

## 3. Success Metrics

* T0 hackathon

  * E2E run completes in under 10 minutes for 500 profiles per campaign.
  * 95 percent job success rate over 24 hours.
  * UI shows leads within 1 minute after LLM step.
* T1 post hackathon

  * 1,000 concurrent daily campaigns without full table scans.
  * P50 LLM latency per profile under 2 seconds local or 1 second cloud.
  * At least 10 percent uplift in reply rate after nightly weight updates.

## 4. Users and Roles

* Operator: configures campaigns and accounts.
* Account: authenticated sender with per day quota.
* Developer or agent: extends workers and scrapers.

## 5. Scope

### In scope

* Node API with Bun, Express, Prisma.
* Python crawler with uv, FastAPI, curl\_cffi.
* Postgres schema for profiles, features, candidates, llm\_scores, leads, jobs, messages, feedback.
* BullMQ scheduler and workers for crawl, qualify, dispatch, feedback, nightly weights.
* LLM qualification required. Local models first. Cloud upgrade later.
* Minimal read API for UI.

### Out of scope for MVP

* Embeddings and vector search.
* Complex RBAC and multi tenant billing.
* Real time UI pushes. Polling is fine.
* Message template personalization beyond variables.

## 6. Non functional requirements

* Reliability: retries with backoff for jobs. Idempotent writes.
* Performance: no scheduled full scans. Incremental updates only.
* Rate limits: token bucket per account. Global crawl concurrency caps.
* Security: API key for admin endpoints in MVP. Secrets in env. No PII beyond public profile data.
* Observability: job status, queue depth, request counts, error rates.

## 7. System Overview

See Architecture and Flow diagrams in canvas. Short summary:

* Python writes ProfileRaw and ProfileFeatures. Node owns everything else.
* Candidate sets maintained by compiled SQL predicates.
* Daily shortlist calls LLM with cache by profile\_hash and criteria\_hash.
* Dispatch respects per account quotas. Feedback informs nightly weights.

## 8. Functional Requirements

### 8.1 Campaigns

* Create campaign with criteria JSON. Store criteria\_hash.
* Edit campaign criteria. Trigger candidate maintenance.

### 8.2 Crawl and Enrich

* Start crawl by seed. Python writes to ProfileRaw and ProfileFeatures.
* Compute content\_hash on ingest. Skip enrichment if unchanged.

### 8.3 Candidate maintenance

* Compile criteria JSON to SQL WHERE. Store text.
* On profile\_features upsert or update, re-evaluate inclusion for related campaigns.
* Evict candidates that fall out of bounds.

### 8.4 Qualification with LLM

* Shortlist K candidates per campaign by cheap score and recency.
* Build prompt with criteria, text fields, and up to 3 image URLs.
* Output JSON only. Schema below.
* Cache in llm\_scores with profile\_hash and criteria\_hash.
* Write or update leads.

### 8.5 Dispatch and Feedback

* Select top N by score per account per day within quota.
* Send messages and record message rows.
* Ingest feedback events: delivered, opened, clicked, replied, followed, converted, bounced.

### 8.6 Nightly weight update

* Update cheap feature weights per campaign using last 14 days of outcomes.
* Cap changes with learning rate and floors to avoid oscillation.

## 9. API Surface

* POST /campaigns
* POST /campaigns/\:id/discover
* POST /campaigns/\:id/qualify
* GET  /campaigns/\:id/leads
* GET  /jobs/\:id

Payloads are the ones already scaffolded in the monorepo.

## 10. Data Model Summary

Tables and keys:

* campaigns(id, name, criteria jsonb, criteria\_hash, created\_at)
* jobs(id, campaign\_id, type, status, started\_at, finished\_at, error\_text)
* profiles\_raw(username, payload jsonb, first\_seen, last\_seen, content\_hash)
* profile\_features(username, followers, engagement, lang, country, has\_link, recent\_activity\_at, features jsonb, version\_hash, updated\_at)
* campaign\_candidates(campaign\_id, username, candidate\_score\_cheap, updated\_at)
* llm\_scores(campaign\_id, username, profile\_hash, criteria\_hash, score, confidence, reasons jsonb, created\_at)
* leads(campaign\_id, username, score, qualified, reasons jsonb, qualified\_at)
* messages(id, account\_id, campaign\_id, username, template\_id, status, sent\_at, error\_text)
* feedback\_events(id, message\_id, type, value, occurred\_at)

## 11. SQL Predicate Compilation

* Input: criteria JSON with numeric bounds, language and country lists, bio and domain lexicons, activity windows.
* Output: SQL WHERE string using pf.\* columns and JSON containment operators.
* Store WHERE text per campaign. Use in two queries: upsert in-bounds rows and delete out-of-bounds rows.

## 12. Content Hash

* Canonicalize fields: username, follower\_count, following\_count, private flag, normalized bio, last 5 captions normalized, top 3 image URLs and sizes, outbound link domains, activity day.
* Hash: sha256 of canonical JSON with stable key order.
* Write to ProfileRaw\.content\_hash and copy to ProfileFeatures.version\_hash.
* Cache key for LLM: (campaign\_id, username, profile\_hash, criteria\_hash).

## 13. LLM Spec

* Inputs: criteria JSON, bio, name, username, follower stats, recent captions, link domains, up to 3 image URLs.
* Output JSON schema:

```
{
  "qualified": boolean,
  "confidence": number,  
  "score": integer,      
  "reasons": string[],   
  "flags": string[]      
}
```

* Hard rule: return JSON only. Refuse to guess when signal is missing.
* Local models first. Cloud models later behind a flag.
* TTL for reuse: 14 days or change on profile\_hash or criteria\_hash.

## 14. Job System

Queues: crawl, qualify, dispatch.
Repeatables:

* crawl.refresh every 10 to 30 minutes.
* qualify.campaign daily per campaign at local midnight.
* dispatch.dm hourly until quota is met.
* feedback.sweep every 15 minutes.

## 15. Milestones

* Day 1: schema and migrations, crawler write path, enrichment, health checks.
* Day 2: candidate maintenance, shortlist, LLM call, leads endpoint.
* Day 3: dispatch, feedback, nightly weights, polish and docs.

## 16. Risks and Mitigations

* Anti bot friction. Mitigate with curl\_cffi, proxy rotation, session reuse.
* LLM variability. Lock prompts and require JSON schema. Cache by hash.
* DB load. Avoid scans. Use triggers or targeted jobs on changes.
* Time. Cut list: progress bars, real time UI, Ollama vision if not ready.

## 17. Acceptance Criteria

* Create, discover, qualify, and list leads work E2E with fake scraper and local LLM.
* No full table scans in logs over a 24 hour run.
* Quotas respected per account. Feedback ingested.
* Nightly weight update modifies weights within bounds and impacts next day shortlist order.

## 18. Open Questions

* API auth choice for MVP: API key header or simple token.
* Vision input path: pass raw URLs or thumbnails. Storage policy.
* Candidate predicate builder UI: minimal JSON editor or simple form.

## 19. Appendix

* Event taxonomy for feedback.
* Message status state machine. Pending, sent, delivered, opened, replied, converted, failed.
