# Prompt Library Production Technical Specification

## Audience and Intent
This document is written for junior engineers building a production version of the browser-only Prompt Library.

Current state:
- Single-page app
- localStorage persistence
- No server-side authentication, collaboration, or integrations

Goal:
- Move from a solo tool to a multi-tenant team product
- Support real-time collaboration, integrations, and enterprise controls
- Scale from 100 users to 1,000,000 users

## 1) System Architecture Document

### 1.1 Opinionated Recommendation Summary
Recommended stack for MVP (0 to 10k users):
- Frontend: React/Next.js web app
- API: REST over HTTPS
- Auth: OAuth + Magic Link fallback
- Database: PostgreSQL (managed service)
- Cache: Redis
- Search: PostgreSQL full-text first, vector search later
- Real-time: WebSocket channels (workspace- and prompt-level)
- Background jobs: Queue-based workers
- Object storage: S3-compatible for import/export files and audit snapshots

Recommended stack for growth (10k to 1M users):
- API decomposition into domain services (auth, prompt, search, integration)
- Read replicas + partitioning strategy for PostgreSQL
- Dedicated search tier (OpenSearch/Meilisearch) and optional vector DB extension
- Event bus for webhooks and analytics pipelines
- Regional deployment with data residency controls

Why this path:
- Fastest MVP delivery while preserving migration path
- PostgreSQL gives strong consistency, relational modeling, SQL flexibility, and lower cognitive load for small teams
- Avoids early complexity from DynamoDB access patterns and eventual consistency pitfalls

---

### 1.2 Data Persistence Strategy

#### Option A: PostgreSQL (recommended)
Strengths:
- Strong relational model for users, workspaces, prompts, versions, permissions
- ACID transactions simplify collaboration edits, sharing changes, and billing events
- Mature indexing options (BTREE, GIN for JSONB/text search)
- Easier ad hoc querying and analytics at startup stage

Weaknesses:
- Needs careful tuning at very high scale
- Multi-region writes are harder than some NoSQL alternatives

Best fit:
- Startup teams iterating quickly
- Complex querying/filtering and rich metadata requirements

#### Option B: DynamoDB
Strengths:
- Predictable horizontal scalability
- Fully managed and highly available

Weaknesses:
- Requires strict access pattern design up front
- Harder ad hoc queries and cross-entity joins
- Team must be experienced with partition keys and hot partitions

Best fit:
- Workloads with very stable read/write patterns and high throughput from day 1

#### Option C: Firebase (Firestore)
Strengths:
- Fast developer velocity
- Built-in realtime listeners and auth ecosystem

Weaknesses:
- Query and indexing limits can become painful for complex enterprise features
- Vendor lock-in risk and potentially rising costs with scale
- Permission/rules complexity at team and enterprise level

Best fit:
- Very early prototypes with minimal backend engineering

#### Final recommendation
Use PostgreSQL for source-of-truth data.
Add Redis for hot reads, rate limits, and collaboration presence state.
Keep an abstraction layer in repository/service code so search and caching can evolve without full rewrites.

---

### 1.3 Authentication and Authorization

Evaluate options:
- OAuth (Google, Microsoft, GitHub): best for team onboarding and enterprise SSO path
- Magic Links: excellent low-friction fallback for non-SSO users
- API Keys: needed only for server-to-server automation and integrations, not primary user login

Recommended approach:
- Primary: OAuth OIDC
- Secondary: Magic Link (passwordless)
- Machine auth: scoped API keys per workspace/integration

AuthZ model:
- Multi-tenant workspace model
- Roles: owner, admin, editor, viewer
- Optional custom roles later (enterprise)

Security controls:
- JWT access token (short TTL) + rotating refresh tokens
- API key hashing at rest (never store plaintext)
- IP/device risk scoring and suspicious login alerts
- Optional 2FA for admin/owner roles

---

### 1.4 Real-Time Collaboration Requirements

Collaboration capabilities:
- Presence indicators (who is viewing/editing)
- Optimistic updates for prompt edits
- Conflict-safe editing model
- Prompt version history with restore

Recommended implementation phases:
1. Phase 1: Last-write-wins + revision ID checks
2. Phase 2: Operational transform/CRDT only if fine-grained simultaneous editing proves critical

Transport:
- WebSocket gateway
- Channels by workspace and prompt ID

Conflict model:
- Each prompt has `version` integer
- Client submits expected version
- Server rejects stale writes with 409 conflict
- Client surfaces merge UI and can reapply changes

Auditability:
- Append-only revision table
- Every write stores actor, timestamp, diff summary

---

### 1.5 Rate Limiting and Abuse Prevention

Abuse vectors:
- Prompt scraping
- API brute force
- Credential stuffing
- Webhook floods
- Bulk export abuse

Recommended controls:
- Token-bucket rate limiting in Redis
- Separate limits per dimension:
  - user ID
  - workspace ID
  - IP address
  - API key
- Dynamic risk-based throttling:
  - stricter limits for anonymous and new accounts
  - relaxed limits for trusted paid workspaces

Baseline limits (starting point):
- Read APIs: 120 req/min/user
- Write APIs: 60 req/min/user
- Auth endpoints: 10 req/min/IP
- Exports: 5/day/workspace on free tier
- Webhooks delivery retries with exponential backoff and cap

Additional defenses:
- WAF and bot detection on edge
- Content size limits for prompt payloads
- Import file scanning, schema validation, and max size caps
- Abuse analytics pipeline with automated temporary bans

---

### 1.6 Search Infrastructure

Two search modes are needed:
- Deterministic filtering and keyword lookup
- Semantic retrieval across prompt intent

Option 1: Full-text search only
- Fast and cheap to start
- Great for title/tag/model exact or fuzzy queries
- Not enough for semantic similarity use cases

Option 2: Vector embeddings only
- Good semantic matching
- Poor for exact filters and strict metadata queries alone
- Higher infra and model inference cost

Recommended hybrid approach:
1. MVP: PostgreSQL full-text + trigram indexes
2. Growth: Hybrid retrieval
   - Step A: metadata filter + full-text candidate set
   - Step B: rerank by vector similarity
3. Enterprise: dedicated search service with query analytics and relevance tuning

Indexing recommendation:
- Store normalized searchable text (`title`, `content`, tags)
- Maintain precomputed tsvector column
- For vectors use pgvector initially, migrate to dedicated vector/search stack if latency or scale demands

---

### 1.7 High-Level Logical Architecture

Core components:
- Web Client
- API Gateway
- Auth Service
- Prompt Service
- Collaboration Service
- Search Service
- Integration/Webhook Service
- Worker Queue
- PostgreSQL
- Redis
- Object Storage
- Observability stack (logs/metrics/traces)

Data flow (write path):
1. Client sends authenticated request
2. API validates auth + rate limits
3. Prompt service validates schema + authorization
4. Transaction writes prompt + revision rows
5. Collaboration event published to WebSocket channel
6. Async indexing and webhook jobs queued

Data flow (search path):
1. Client query + filters
2. Search endpoint applies workspace and permission constraints
3. Full-text retrieval
4. Optional vector rerank
5. Paginated results returned

## 2) API Design Specification

### 2.1 REST vs GraphQL Evaluation

REST advantages:
- Simpler ops and caching
- Predictable endpoint-level auth and rate limiting
- Easier webhook/event mapping

GraphQL advantages:
- Flexible querying for varied UI needs
- Fewer round trips on complex pages

Recommendation:
- Start with REST for speed, observability clarity, and team maintainability
- Add a GraphQL read gateway only if front-end query flexibility becomes a bottleneck

---

### 2.2 API Versioning Strategy

Recommendation:
- URL versioning: `/v1/...`
- Non-breaking changes via additive fields
- Breaking changes only in `/v2`

Policy:
- Minimum 6-month deprecation window for old versions
- Changelog and migration guides required before deprecation
- Contract tests enforce backward compatibility for v1

---

### 2.3 Resource Model and Endpoint Draft

Primary resources:
- users
- workspaces
- workspace_members
- prompts
- prompt_versions
- tags
- api_keys
- webhooks
- webhook_deliveries
- imports
- exports

Sample REST endpoints:
- `POST /v1/auth/oauth/callback`
- `POST /v1/auth/magic-link/request`
- `POST /v1/auth/magic-link/verify`
- `GET /v1/workspaces`
- `POST /v1/workspaces`
- `POST /v1/workspaces/{workspaceId}/members`
- `GET /v1/workspaces/{workspaceId}/prompts`
- `POST /v1/workspaces/{workspaceId}/prompts`
- `GET /v1/workspaces/{workspaceId}/prompts/{promptId}`
- `PATCH /v1/workspaces/{workspaceId}/prompts/{promptId}`
- `DELETE /v1/workspaces/{workspaceId}/prompts/{promptId}`
- `POST /v1/workspaces/{workspaceId}/prompts/import`
- `POST /v1/workspaces/{workspaceId}/prompts/export`
- `GET /v1/workspaces/{workspaceId}/search`
- `POST /v1/workspaces/{workspaceId}/webhooks`
- `GET /v1/workspaces/{workspaceId}/webhooks/{webhookId}/deliveries`

Error model:
- Standard JSON envelope: `code`, `message`, `details`, `requestId`
- Include machine-readable `code` values (`conflict_version_mismatch`, `rate_limited`, etc.)

---

### 2.4 Pagination Strategy

Recommendation: cursor-based pagination for prompt lists and search.

Why:
- Better performance and consistency than offset at high scale
- Avoid duplicate/missing records during concurrent writes

Contract:
- Request: `?limit=50&cursor=...`
- Response:
  - `items`
  - `pageInfo.nextCursor`
  - `pageInfo.hasNextPage`

Sorting:
- Default by `updatedAt desc`
- Secondary deterministic tie-breaker by `id desc`

Limits:
- Max page size 100
- Default 25

---

### 2.5 Webhook Events for Integrations

Event categories:
- Prompt lifecycle
- Collaboration
- Workspace administration
- Import/export jobs

Initial event list:
- `prompt.created`
- `prompt.updated`
- `prompt.deleted`
- `prompt.version_restored`
- `workspace.member_added`
- `workspace.member_removed`
- `import.completed`
- `import.failed`
- `export.completed`

Delivery guarantees:
- At-least-once delivery
- Signed payloads (HMAC SHA-256)
- Retries with exponential backoff
- Dead-letter queue after max attempts

Consumer requirements:
- Idempotency key in each event
- Event timestamp and unique event ID

## 3) Scaling Projections

### 3.1 Growth Phases

Phase 0: 100 users
- Single region
- One API service + one PostgreSQL instance + Redis
- Daily backups and basic observability

Phase 1: 10k users
- Add read replicas
- Introduce async workers for indexing/webhooks/import-export
- Improve dashboards and SLO alerts

Phase 2: 100k users
- Split services by domain
- Introduce dedicated search cluster
- Add queue partitioning and stronger tenancy isolation
- Start data archival strategy for old versions/events

Phase 3: 1M users
- Multi-region architecture with clear data residency strategy
- Sharded/partitioned data strategy
- Traffic shaping and prioritized workloads
- Strong disaster recovery RTO/RPO guarantees

---

### 3.2 Cost Per User Projections (Opinionated)

Assumptions:
- Mix of free and paid users
- Average 200 prompts/user by mature stage
- Moderate collaboration and search usage
- Cloud managed services and standard observability stack

Estimated infra cost per monthly active user (MAU):
- 100 users: $2.00 to $5.00 per MAU (small scale overhead dominates)
- 10k users: $0.40 to $1.20 per MAU
- 100k users: $0.15 to $0.50 per MAU
- 1M users: $0.05 to $0.20 per MAU

Major cost drivers:
- Search and embedding inference
- Egress from webhook and export traffic
- Log/trace retention volume
- Multi-region replication

Cost controls to implement early:
- Tiered retention for revisions and logs
- Cache hot queries and prompt metadata aggressively
- Batch webhook dispatch and retries
- Use async embedding generation and budget caps

---

### 3.3 Performance Benchmarks and SLO Targets

User-facing performance targets:
- P50 API read latency: < 100 ms
- P95 API read latency: < 300 ms
- P99 API read latency: < 800 ms
- P95 write latency: < 400 ms
- Real-time collaboration update fanout: < 500 ms end-to-end
- Search query P95: < 500 ms (full-text), < 900 ms (hybrid semantic)

Reliability targets:
- API availability: 99.9% initially, 99.95% at scale
- Webhook success (after retries): > 99%
- Import/export job completion: > 99.5%

Data durability targets:
- Automated backups every 24h at MVP, move to PITR quickly
- RPO:
  - MVP: <= 24h
  - Growth: <= 15 min
- RTO:
  - MVP: <= 8h
  - Growth: <= 1h

## 4) Implementation Roadmap

### Milestone A (2 to 4 weeks): Production foundation
- Auth service with OAuth + magic link
- PostgreSQL schema and migration framework
- Core prompt CRUD APIs with workspace RBAC
- Import/export server endpoints with background job support
- Basic rate limits and structured logs

### Milestone B (4 to 8 weeks): Team collaboration
- Revision history and conflict-safe updates
- WebSocket collaboration presence
- Cursor pagination and advanced filtering
- Webhooks with signed events

### Milestone C (8 to 12 weeks): Search and reliability hardening
- Full-text search indexes and relevance tuning
- Observability: metrics, traces, SLO dashboards
- Improved abuse prevention and anomaly detection
- Backup restore drills and incident runbooks

### Milestone D (post-PMF): Scale architecture
- Service decomposition and workload isolation
- Dedicated search/vector tier
- Multi-region and enterprise features

## 5) Engineering Guardrails for Junior Team

Non-negotiables:
- Every endpoint enforces workspace-level authorization
- No plaintext API keys or secrets in database logs
- Every write path emits audit metadata
- All external events and imports are schema validated
- Contract tests for API stability and versioning

Coding practices:
- Use explicit domain models and DTO validation
- Keep migration scripts reversible
- Use idempotency keys for mutating APIs called by integrations
- Add load tests before shipping major query changes

Operational practices:
- Define on-call ownership before beta launch
- Run game days for database failover and queue backlog recovery
- Track top 10 slow endpoints weekly and enforce performance budgets

## Final Recommendation
If you are building from zero to MVP with a small team, choose:
- PostgreSQL + Redis + REST + OAuth/magic links + full-text search first

Then evolve to:
- Hybrid search, stronger collaboration model, service decomposition, and multi-region readiness only when your metrics force it

This approach minimizes early complexity while preserving a clear path to 1M users.