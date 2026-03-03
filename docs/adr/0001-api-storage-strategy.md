# ADR-0001 — API Storage Strategy

**Status:** Accepted
**Date:** 2026-03-02
**Deciders:** Orion (AI agent), Engineering lead

---

## Context

The PT Adherence API must persist user accounts, rehab plans, and session
logs across requests. For the MVP we need to choose a storage strategy that:

1. Lets us ship fast with minimal operational overhead.
2. Keeps the data model simple enough to pivot quickly.
3. Provides a clear migration path to a production-grade store.

The primary data entities are:

| Entity | Approximate record count at MVP launch |
|---|---|
| User | < 500 (closed beta) |
| Plan | < 500 (1 per user) |
| Session | < 5 000 (avg 10 per user) |
| Exercise log entry | < 50 000 |

---

## Decision

**Use an in-memory Python dict store for the MVP API.**

The store (`apps/api/app/store.py`) is a module-level dict keyed by entity ID.
All CRUD operations are synchronous and run in the single Uvicorn worker process.
There is no persistence across server restarts.

---

## Rationale

### Why in-memory?

- **Zero infrastructure dependency.** No database server to provision, secure,
  back up, or migrate. A `git clone` + `uvicorn` is the complete deployment.
- **Fastest possible iteration.** Schema changes require only editing a Python
  dict initialiser — no migration scripts, no ORM boilerplate.
- **Right-sized for closed beta.** All projected MVP record counts comfortably
  fit in a few MB of RAM on any modern VM.
- **Easy to inspect.** During development and QA, engineers can `print` or
  breakpoint the entire store state in seconds.

### Why not a database at MVP?

- PostgreSQL/SQLite adds operational complexity (connection pooling, migration
  tooling, backup schedules, secrets management) with no user-visible benefit
  during a closed beta where losing test data is acceptable.
- Premature schema optimisation is a common source of rework; an in-memory
  store keeps us honest about not over-engineering before we understand real
  access patterns.

---

## Consequences

### Accepted trade-offs

| Trade-off | Mitigation |
|---|---|
| **Data lost on restart.** | Acceptable in closed beta. Users are warned; sessions are short. |
| **No horizontal scaling.** | Single Uvicorn worker; fine for < 500 concurrent users in beta. |
| **No persistence guarantees.** | Weekly summary export uses data from within a single session; PDF email is the durable artefact. |
| **No complex queries.** | The store supports only key-based lookups. Filtering (e.g., sessions by week) is done in-process by iterating values. |

### Migration path (post-MVP)

When the beta proves product-market fit, migrate to PostgreSQL via:

1. Define SQLAlchemy models mirroring the existing store dict structure.
2. Add Alembic for migrations.
3. Replace `store.py` calls with `db.session` calls in each router.
4. Back-fill existing users (if needed) via a one-time migration script.

The API layer (FastAPI routers) is written to accept the store as a dependency,
so swapping the backing store requires only updating the dependency, not the
route handlers.

---

## Alternatives considered

| Option | Rejected because |
|---|---|
| **SQLite** | Adds file-system dependency; WAL-mode needed for concurrent writes; migration tooling still required. Complexity without enough benefit at MVP scale. |
| **PostgreSQL from day one** | Doubles setup time; requires managed DB service in staging/prod; migration risk before product is validated. |
| **Redis** | Adds a network dependency; overkill for key-value lookups at this scale. |
| **Firestore / DynamoDB** | Vendor lock-in; pricing unpredictability; complicates local dev. |
