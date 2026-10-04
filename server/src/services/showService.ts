import crypto from 'crypto';
import { getPool, withTransaction } from '../db';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import {
  seatsAvailableGauge,
  seatsConfirmedGauge,
  seatsHeldGauge,
} from '../metrics';

export interface CreateShowInput {
  name: string;
  seats: string[];
  price_paise: number;
  per_user_limit?: number;
}

export interface SeatDetail {
  seat_number: string;
  status: 'available' | 'held' | 'confirmed';
  user_id?: string | null;
  reservation_id?: string | null;
}

export interface ShowResponse {
  id: string;
  name: string;
  price_paise: number;
  per_user_limit: number;
  total_seats: number;
  available_seats: number;
  held_seats: number;
  confirmed_seats: number;
  reconciliation_invariant: boolean;
  seats: SeatDetail[];
  created_at: string;
}

export async function createShow(input: CreateShowInput): Promise<ShowResponse> {
  if (!input.name || typeof input.name !== 'string') {
    throw new AppError('Show name is required', 400, 'INVALID_INPUT');
  }
  if (!Array.isArray(input.seats) || input.seats.length === 0) {
    throw new AppError('Seats array must be non-empty', 400, 'INVALID_INPUT');
  }
  if (typeof input.price_paise !== 'number' || input.price_paise < 0 || !Number.isInteger(input.price_paise)) {
    throw new AppError('price_paise must be a non-negative integer', 400, 'INVALID_INPUT');
  }

  const perUserLimit = input.per_user_limit && input.per_user_limit > 0 ? input.per_user_limit : 4;
  const showId = `show_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Deduplicate and validate seat names
  const uniqueSeats = Array.from(new Set(input.seats.map((s) => String(s).trim()))).filter(Boolean);
  if (uniqueSeats.length === 0) {
    throw new AppError('At least one valid seat is required', 400, 'INVALID_INPUT');
  }

  return withTransaction(async (client) => {
    // 1. Insert show
    const showResult = await client.query(
      `INSERT INTO shows (id, name, price_paise, per_user_limit)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, price_paise, per_user_limit, created_at`,
      [showId, input.name.trim(), input.price_paise, perUserLimit]
    );
    const show = showResult.rows[0];

    // 2. Batch insert seats
    // Generate multi-row parameter placeholders ($1, $2, 'available'), ($3, $4, 'available'), ...
    const valuePlaceholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const seat of uniqueSeats) {
      valuePlaceholders.push(`($${pIdx++}, $${pIdx++}, 'available')`);
      values.push(showId, seat);
    }

    const insertSeatsQuery = `
      INSERT INTO seats (show_id, seat_number, status)
      VALUES ${valuePlaceholders.join(', ')}
      RETURNING seat_number, status
    `;

    const seatResult = await client.query(insertSeatsQuery, values);
    const seats: SeatDetail[] = seatResult.rows.map((r: any) => ({
      seat_number: r.seat_number,
      status: r.status,
    }));

    // Update Prometheus gauges
    seatsAvailableGauge.set({ show_id: showId }, seats.length);
    seatsConfirmedGauge.set({ show_id: showId }, 0);
    seatsHeldGauge.set({ show_id: showId }, 0);

    return {
      id: show.id,
      name: show.name,
      price_paise: show.price_paise,
      per_user_limit: show.per_user_limit,
      total_seats: seats.length,
      available_seats: seats.length,
      held_seats: 0,
      confirmed_seats: 0,
      reconciliation_invariant: true,
      seats,
      created_at: show.created_at,
    };
  });
}

export async function getShow(id: string): Promise<ShowResponse> {
  const pool = getPool();
  const showResult = await pool.query(
    `SELECT id, name, price_paise, per_user_limit, created_at
     FROM shows WHERE id = $1`,
    [id]
  );

  if (showResult.rowCount === 0) {
    throw new NotFoundError(`Show with ID ${id} not found`);
  }

  const show = showResult.rows[0];

  const seatsResult = await pool.query(
    `SELECT seat_number, status, user_id, reservation_id
     FROM seats
     WHERE show_id = $1
     ORDER BY seat_number ASC`,
    [id]
  );

  const seats: SeatDetail[] = seatsResult.rows.map((r) => ({
    seat_number: r.seat_number,
    status: r.status,
    user_id: r.user_id,
    reservation_id: r.reservation_id,
  }));

  let availableCount = 0;
  let heldCount = 0;
  let confirmedCount = 0;

  for (const s of seats) {
    if (s.status === 'available') availableCount++;
    else if (s.status === 'held') heldCount++;
    else if (s.status === 'confirmed') confirmedCount++;
  }

  const totalSeats = seats.length;
  const invariantHolds = availableCount + heldCount + confirmedCount === totalSeats;

  // Sync Prometheus metrics
  seatsAvailableGauge.set({ show_id: id }, availableCount);
  seatsHeldGauge.set({ show_id: id }, heldCount);
  seatsConfirmedGauge.set({ show_id: id }, confirmedCount);

  return {
    id: show.id,
    name: show.name,
    price_paise: show.price_paise,
    per_user_limit: show.per_user_limit,
    total_seats: totalSeats,
    available_seats: availableCount,
    held_seats: heldCount,
    confirmed_seats: confirmedCount,
    reconciliation_invariant: invariantHolds,
    seats,
    created_at: show.created_at,
  };
}

export async function listShows(): Promise<any[]> {
  const pool = getPool();
  const result = await pool.query(`
    SELECT s.id, s.name, s.price_paise, s.per_user_limit, s.created_at,
           COUNT(st.id) AS total_seats,
           COUNT(CASE WHEN st.status = 'available' THEN 1 END) AS available_seats,
           COUNT(CASE WHEN st.status = 'confirmed' THEN 1 END) AS confirmed_seats,
           COUNT(CASE WHEN st.status = 'held' THEN 1 END) AS held_seats
    FROM shows s
    LEFT JOIN seats st ON s.id = st.show_id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    price_paise: row.price_paise,
    per_user_limit: row.per_user_limit,
    created_at: row.created_at,
    total_seats: parseInt(row.total_seats, 10),
    available_seats: parseInt(row.available_seats, 10),
    confirmed_seats: parseInt(row.confirmed_seats, 10),
    held_seats: parseInt(row.held_seats, 10),
    reconciliation_invariant:
      parseInt(row.available_seats, 10) +
        parseInt(row.held_seats, 10) +
        parseInt(row.confirmed_seats, 10) ===
      parseInt(row.total_seats, 10),
  }));
}
