# Engineering Write-Up: Seat Reservation at Scale
**Assessment for Backend Engineering · Deploy & Observe Round · Paytm Money**

---

## 1. The Atomic Decision Mechanism

### The Exact Mechanism
In an on-sale stampede where thousands of concurrent buyers attempt to claim the same hot seat (e.g. `A12`), naive read-then-write logic (`SELECT status -> if available -> UPDATE`) inevitably fails due to race conditions, leading to double-selling.

To guarantee zero double-sells and deterministic outcomes under load, our decision logic is pushed entirely into **PostgreSQL Row-Level Locks with Ordered Concurrency Control (`SELECT ... FOR UPDATE`) within ACID transactions**:

```sql
SELECT seat_number, status, user_id
FROM seats
WHERE show_id = $1 AND seat_number = ANY($2)
ORDER BY seat_number ASC
FOR UPDATE;
```

Coupled with a database-level unique constraint:
```sql
CONSTRAINT uq_show_seat UNIQUE (show_id, seat_number)
```

### Why It Is Race-Free
1. When 500 concurrent buyers hit `A12` at the exact same millisecond, PostgreSQL grants the exclusive row-level lock to exactly one transaction.
2. The winning transaction verifies `status = 'available'`, proceeds to update the row to `'confirmed'`, registers the reservation, and commits.
3. The remaining 499 transactions are queued behind the lock. As each transaction acquires the row lock in turn, it re-reads the committed state, observes `status = 'confirmed'`, immediately aborts, and returns a clean **`409 Conflict` (domain outcome `SEAT_TAKEN`)** with zero server-side 5xx errors.

### Deadlock Avoidance for Multi-Seat Requests
A classic multi-seat concurrency pitfall is circular waiting (deadlock). If User 1 requests seats `[A1, A2]` while User 2 requests `[A2, A1]`, User 1 acquires `A1` and waits for `A2`, while User 2 acquires `A2` and waits for `A1`, causing PostgreSQL to abort one with error `40P01 (deadlock detected)`.

**Our Solution:**
All incoming seat arrays are **lexicographically sorted in application memory (`ORDER BY seat_number ASC`)** prior to issuing queries:
```typescript
const sortedSeats = Array.from(new Set(input.seats.map(s => String(s).trim()))).sort();
```
Because locks are acquired in the exact same global ascending order across all concurrent transactions, **a circular dependency graph can never form**, mathematically eliminating transaction deadlocks.

### Multi-Seat Partial Policy
We enforce an **All-or-Nothing (Atomic)** policy:
If a user requests `["A12", "A13"]` and `A12` is free but `A13` is taken, the transaction aborts completely and rolls back. No partial holds or orphan seats are allocated.

---

## 2. Idempotency Architecture

### Where the Key Is Stored
Idempotency state is persisted in a dedicated relational table:
```sql
CREATE TABLE idempotency_keys (
    idempotency_key VARCHAR(128) NOT NULL,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    request_hash VARCHAR(64) NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (show_id, idempotency_key)
);
```

### Enforcing Exactly-Once Semantics
1. The idempotency check is executed **inside the same database transaction** as the seat lock and reservation insertion.
2. When a reservation succeeds, the payload hash (SHA-256 over canonical show ID and sorted seat numbers) and the final 201 response body are stored in `idempotency_keys`.
3. If an identical network retry arrives (common during mobile packet loss or user multi-clicks), the transaction acquires the row lock on `idempotency_keys`, detects matching `request_hash`, increments `seat_reservations_idempotent_replay_total`, and immediately returns the cached response with header `X-Idempotent-Replay: true`.

### Same Key with Different Body Handling
If a client attempts to reuse an existing `idempotency_key` with a different seat payload (e.g. key `K1` used for `["A1"]` and subsequently for `["A2"]`), the SHA-256 hash check fails.
The system declines the request immediately with **`409 Conflict` (`IDEMPOTENCY_MISMATCH`)**, preventing request mutation or identity hijacking.

---

## 3. Holds & Expiry / Cancellation Mechanics

### Cancellation Model
We implement an explicit, authenticated cancellation endpoint:
```
POST /reservations/:id/cancel
```
- **Ownership Verification**: Extracts `user_id` from the authenticated Bearer token and verifies `user_id === reservation.user_id` (or `role === 'admin'`). Imposter requests receive `403 Forbidden`.
- **Atomic Release**: Acquires a row lock on the reservation, transitions status to `'cancelled'`, and resets associated seats back to `'available'`:
  ```sql
  UPDATE seats
  SET status = 'available', user_id = NULL, reservation_id = NULL, updated_at = NOW()
  WHERE show_id = $1 AND reservation_id = $2;
  ```
- **Resurrection Prevention**: A cancelled reservation cannot be cancelled again. The released seats become cleanly re-bookable by other users, without touching seats belonging to other active reservations.

---

## 4. Consistency vs Availability Under Network Partition (PACELC / CAP)

In distributed systems design, the CAP theorem states that under network partition ($P$), a system must choose between Consistency ($C$) and Availability ($A$).

### Design Choice: Strict Consistency ($CP$)
For an inventory system of record dealing with finite, physical seats and financial transactions (money in integer paise):
* **Consistency trumps Availability.**
* Selling the same seat twice is a catastrophic financial and operational failure (overbooking, venue safety violations, refund liabilities, brand damage).
* Under a network partition between the API instances and the primary datastore, the service **fails closed**:
  - The readiness probe (`/health/ready`) queries `SELECT 1` on PostgreSQL and immediately returns **`503 Service Unavailable`**.
  - Upstream load balancers / cloud routers stop routing traffic to unhealthy pods.
  - The API returns clean 503s rather than accepting reservations that cannot be guaranteed atomic.

---

## 5. Observability: What We'd Get Paged for at 2 AM

### 1. High Priority PagerDuty Alerts (2 AM Wakeups)
1. **Reconciliation Invariant Breach (`reconciliation_invariant_failure > 0`)**:
   - If `available + held + confirmed != total_seats` for any show, inventory data has drifted. This indicates either an uncommitted orphan update or corrupted state.
2. **Spike in 5xx Error Rate (`http_5xx_rate > 1%` over 2m)**:
   - Clean declines (seat taken, per-user limit) must ALWAYS be 4xx. Any 5xx represents unhandled exceptions, database connection pool exhaustion, or syntax regressions.
3. **Database Readiness Failure (`probe_health_ready_status == 0`)**:
   - PostgreSQL unreachable, connection pool timeouts, or deadlocks exceeding thresholds.
4. **p99 Latency Degradation (`http_request_duration_seconds{quantile="0.99"} > 500ms`)**:
   - Under heavy contention, long transaction wait queues degrade user experience and exhaust Node.js event loop queues.

### 2. Prometheus Metrics Exposed
* `seat_reservations_confirmed_total{show_id}` (Counter)
* `seat_reservations_declined_total{reason="seat_taken|user_limit|idempotent_mismatch", show_id}` (Counter)
* `seat_reservations_idempotent_replay_total{show_id}` (Counter)
* `seats_available_gauge{show_id}` (Gauge)
* `seats_confirmed_gauge{show_id}` (Gauge)
* `seats_held_gauge{show_id}` (Gauge)
* `http_request_duration_seconds` (Histogram with latency buckets)

---

## 6. AI Usage Disclosure (Directed vs. Decided)

In compliance with the Paytm Money assessment guidelines, AI assistance was utilized as follows:

* **What was Decided by the Engineer**:
  - The architectural decision to use PostgreSQL row-level locks with deterministic sorting (`ORDER BY seat_number ASC`) to mathematically eliminate deadlocks.
  - The decision to enforce strict All-or-Nothing partial request semantics.
  - The schema design with compound unique keys `(show_id, seat_number)` and `(show_id, idempotency_key)`.
  - The health check fail-closed strategy (503 readiness on DB disconnect).
  - The unified single-container deployment model (Express serving production Vite assets).
* **What was Directed to the AI**:
  - Writing boilerplate Express route handlers and middleware scaffolding.
  - Generating TypeScript interfaces and standard Prometheus `prom-client` metric declarations.
  - Drafting the React Tailwind CSS visual seat matrix and component layout.
  - Generating load burst simulation harnesses (`burst.ts`).

---

## 7. What We'd Do Next (Future Architecture Extensions)

If taking this service to production at millions of concurrent requests:
1. **Redis Caching for Seat Layout & Available Gauges**:
   - Cache static show metadata and seat maps in Redis. Use Redis Bloom filters or hyperloglog for instant pre-filtering of sold-out shows before hitting Postgres.
2. **Virtual Waiting Room & Token-Bucket Rate Limiting**:
   - Introduce an edge rate limiter (Cloudflare Workers or Envoy) with token buckets to smooth out traffic spikes from 20,000 req/sec down to the database connection pool throughput capacity.
3. **Database Sharding by `show_id`**:
   - High contention is isolated within individual shows. By sharding database instances using `show_id` as the shard key, contention on a concert in Mumbai never impacts a movie hall in Delhi.
4. **Time-Boxed Ephemeral Holds via Redis Key Expiry (TTL)**:
   - For temporary 5-minute checkout holds, utilize Redis `SET seat:<show_id>:<seat_no> <user_id> NX EX 300` combined with Redis Keyspace notifications to automatically release expired holds back to the available pool.
