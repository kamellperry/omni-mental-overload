# Architecture and Data Flow

# Omni MVP Architecture and Data Flow

```mermaid
graph TD
  UI[Web UI]

  subgraph API["HTTP API (Node)"]
    API1[POST /campaigns]
    API2[POST /campaigns/:id/discover]
    API3[POST /campaigns/:id/qualify]
    API4[GET  /campaigns/:id/leads]
    API5[GET  /campaigns/:id/status]
    API6[GET  /jobs/:id]
  end

  subgraph Orchestrator["Node workers + scheduler"]
    SCHED[Scheduler repeatables]
    Q[Queue BullMQ on Redis]
    WCAND[Worker maintain_candidates]
    WQUAL[Worker qualify.campaign]
    WDISP[Worker dispatch.dm]
    WFB[Worker feedback.sweep]
    WWT[Worker nightly weight update]
  end

  subgraph Python["Python Crawler"]
    FAPI[FastAPI]
    SCRAPE[Scraper curl_cffi]
    ENRICH[Feature extract]
  end

  subgraph Data["Data stores"]
    PG[(Postgres\nprofiles_raw, profile_features, campaign_candidates, llm_scores, leads, messages, feedback_events)]
    REDIS[(Redis)]
    OBJ[(Object storage images)]
  end

  LLM[LLM service\nOllama or cloud]
  External[Platform DM]

  UI --> API
  API1 --> PG
  API2 --> Q
  API3 --> Q
  API4 --> PG
  API5 --> PG
  API6 --> PG

  SCHED --> Q
  Q --> FAPI
  FAPI --> SCRAPE --> PG
  SCRAPE --> OBJ
  SCRAPE --> ENRICH --> PG

  PG <--> WCAND
  WCAND --> PG

  PG --> WQUAL
  WQUAL --> LLM --> WQUAL
  WQUAL --> PG

  PG --> WDISP
  WDISP --> External
  External --> WFB
  WFB --> PG

  REDIS --- Q
```

```mermaid
flowchart TD
  A[Create campaign\nPOST /campaigns] --> B[Compile SQL predicate\nstore criteria_hash]
  B --> C[Discover\nPOST /campaigns/:id/discover]
  C --> D[Enqueue crawl.seed]
  D --> E[Python scrape]
  E --> F[Compute content_hash]
  F --> G{hash changed?}
  G -- no --> H[Update last_seen only]
  G -- yes --> I[Write profiles_raw\npayload + hash]
  I --> J[Enrich features\nwrite profile_features\nwith version_hash]
  J --> K[Maintain campaign_candidates\nupsert or evict by compiled WHERE]
  K --> L[Daily qualify.campaign]
  L --> M[Shortlist K by cheap score and recency\nskip where cached llm_scores\n(profile_hash, criteria_hash)]
  M --> N[LLM evaluate\ntext + up to 3 image URLs]
  N --> O[Write llm_scores and leads]
  O --> P[Dispatch.dm with rate limits\nper account]
  P --> Q[Send DMs\nrecord messages]
  Q --> R[Ingest feedback events]
  R --> S[Nightly weight update per campaign\nupdate cheap feature weights]
  S --> T[Next day cheap score improves\nfeeds new shortlist]
```
