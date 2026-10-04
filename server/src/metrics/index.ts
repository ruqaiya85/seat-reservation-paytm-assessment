import client from 'prom-client';

// Enable default system metrics (memory, event loop, CPU, GC)
client.collectDefaultMetrics({ prefix: 'seat_service_' });

// 1. Reservations confirmed counter
export const reservationsConfirmedTotal = new client.Counter({
  name: 'seat_reservations_confirmed_total',
  help: 'Total number of successfully confirmed seat reservations',
  labelNames: ['show_id'],
});

// 2. Reservations declined counter with reason label
export const reservationsDeclinedTotal = new client.Counter({
  name: 'seat_reservations_declined_total',
  help: 'Total number of seat reservations declined, labeled by domain reason',
  labelNames: ['reason', 'show_id'],
});

// 3. Idempotent replayed counter
export const reservationsIdempotentReplayTotal = new client.Counter({
  name: 'seat_reservations_idempotent_replay_total',
  help: 'Total number of idempotent reservation retries served from cache',
  labelNames: ['show_id'],
});

// 4. Seats available gauge
export const seatsAvailableGauge = new client.Gauge({
  name: 'seats_available_gauge',
  help: 'Current number of available seats per show',
  labelNames: ['show_id'],
});

// 5. Seats confirmed gauge
export const seatsConfirmedGauge = new client.Gauge({
  name: 'seats_confirmed_gauge',
  help: 'Current number of confirmed seats per show',
  labelNames: ['show_id'],
});

// 6. Seats held gauge
export const seatsHeldGauge = new client.Gauge({
  name: 'seats_held_gauge',
  help: 'Current number of held seats per show',
  labelNames: ['show_id'],
});

// 7. HTTP request latency histogram
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const metricsRegistry = client.register;
