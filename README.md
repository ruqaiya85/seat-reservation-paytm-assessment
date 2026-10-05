# Paytm Money · Seat Reservation at Scale
> **Take-Home Assessment — Deploy & Observe Round · Backend Engineering**  
> High-concurrency seat reservation system engineered for extreme contention, atomic correctness, strict idempotency, and real-time observability.

---

## ⚡ The Correctness Bar

| Invariant | Guarantee | Mechanism |
|---|---|---|
| **No Double-Sell** | Exactly 1 winner per hot seat; all others get clean `409 Conflict`. | Row locks with `SELECT ... FOR UPDATE` & unique `(show_id, seat_number)` constraint. |
| **Deadlock-Free** | Zero transaction deadlocks under multi-seat concurrent requests. | Lexicographical seat sorting (`ORDER BY seat_number ASC`) globally. |
| **Zero 5xx Under Load** | Contention outcomes are domain 4xx responses, never server crashes. | Centralized domain error middleware with 409 classification. |
| **Reconciliation Invariant** | `available + held + confirmed == total_seats` holds at all times. | Atomic transactional transitions; verified on every state query. |
| **Idempotency** | Exact replay returns cached reservation; modified body rejected with 409. | Cryptographic SHA-256 payload hashing stored in `idempotency_keys` table. |
| **Per-User Quota** | Max `per_user_limit` (default 4) seats per user per show under concurrency. | Atomic quota verification inside transaction lock. |
| **Token-Derived Identity** | Caller identity comes strictly from token; cannot spoof other users. | Bearer token verification; authorization checks on cancellations. |
| **Currency Invariant** | All money values stored and handled as integer paise. | Integer columns with non-negative constraints. Never floating point. |

---

## 🏗️ Architecture & Tech Stack

* **Backend**: Node.js 20+, TypeScript, Express
* **Database**: PostgreSQL 16 with ACID transactions & connection pooling
* **Observability**: Prometheus metrics (`prom-client`), structured logging (`pino`), readiness/liveness health probes
* **Frontend**: React 18, Vite, Tailwind CSS, Lucide icons (interactive live seat matrix, user simulator, invariant monitor)
* **Deployment**: Docker, Docker Compose, Railway

---

## 🚀 One-Command Concurrency Burst Test

We provide an automated burst runner (`./burst.sh` / `npm run burst`) that bombards the target URL with concurrent traffic, reproducing:
1. **Readiness Probe**: Verifies DB connectivity.
2. **Fresh Show Creation**: Creates a show with 100 seats and limit 4.
3. **Hot-Seat Storm**: **500 concurrent buyers** fighting for seat `A12` simultaneously.
4. **Idempotent Retries**: 50 parallel requests repeating the winning key.
5. **Idempotency Mismatch**: Same key with altered seat request (verifies 409).
6. **Per-User Quota Storm**: 1 user firing 10 parallel distinct seat reservations (verifies max 4 won, 6 clean 409 declines).
7. **Broad On-Sale Stampede**: Hundreds of requests across all remaining seats.
8. **Cancellation & Security**: Imposter cancellation (verifies 403) and legitimate owner release.
9. **Final Reconciliation Check**: Confirms `available + held + confirmed == total_seats`.

### How to Run:
```bash
# Start production server (serves frontend + backend together):
npm start

#client
npm run build:client

# Run in development mode (with live hot-reload for frontend and backend):
npm run dev

# Run concurrency stress test (burst test):
npm run burst -- http://localhost:3000

```


---

## 💻 Local Setup & Development

### Option A: Using Docker Compose (Recommended)
Spins up PostgreSQL and the containerized application together:

```bash
# 1. Start all services
docker compose up --build

# App & UI will be available at: http://localhost:3000
# Metrics at: http://localhost:3000/metrics
# Readiness at: http://localhost:3000/health/ready
```

### Option B: Local Node.js Development

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure environment (.env or environment variables)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/seat_reservation"
export PORT=3000

# 3. Start development servers
npm run dev
```

---

## 📡 API Reference

### 1. Create Show (Admin)
`POST /shows`
```json
{
  "name": "friday-night-imax",
  "seats": ["A1", "A2", "A3", "A4"],
  "price_paise": 25000,
  "per_user_limit": 4
}
```
*Response `201 Created`*

---

### 2. Reserve Seats (Authenticated User)
`POST /shows/:id/reserve`  
**Headers**:
- `Authorization: Bearer <token_or_user_id>`
- `Idempotency-Key: <unique_uuid>`

```json
{
  "seats": ["A1", "A2"]
}
```
*Response `201 Created`* (or `200 OK` on idempotent replay):
```json
{
  "reservation_id": "res_1738491029_abc123",
  "show_id": "show_1738491000_def456",
  "user_id": "user-alice",
  "seats": ["A1", "A2"],
  "amount_paise": 50000,
  "status": "confirmed"
}
```

*Declines (`409 Conflict`)*:
- `{ "error": "SEAT_TAKEN", "message": "..." }`
- `{ "error": "USER_LIMIT_EXCEEDED", "message": "..." }`
- `{ "error": "IDEMPOTENCY_MISMATCH", "message": "..." }`

---

### 3. Cancel Reservation
`POST /reservations/:id/cancel`  
**Headers**: `Authorization: Bearer <token>`
*Releases seats back to available. Only permitted by reservation owner.*

---

### 4. Show State & Reconciliation
`GET /shows/:id`
```json
{
  "id": "show_1738491000_def456",
  "name": "friday-night-imax",
  "price_paise": 25000,
  "per_user_limit": 4,
  "total_seats": 100,
  "available_seats": 98,
  "held_seats": 0,
  "confirmed_seats": 2,
  "reconciliation_invariant": true,
  "seats": [...]
}
```

---

### 5. Health & Observability
- `GET /health/live` — Process liveness (200 OK).
- `GET /health/ready` — Dependency readiness (queries Postgres `SELECT 1`, fails 503 if unreachable).
- `GET /metrics` — Prometheus metrics export (`reservations_confirmed`, `reservations_declined`, `seats_available`, `http_duration`).

---

## 📖 In-Depth Engineering Write-Up
See [WRITEUP.md](./WRITEUP.md) for full architectural justifications, deadlock proofs, PACELC consistency analysis, and 2 AM alerting policies.
