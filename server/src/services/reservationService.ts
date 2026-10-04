import crypto from 'crypto';
import { getPool, withTransaction } from '../db';
import {
  AppError,
  SeatTakenError,
  UserLimitExceededError,
  IdempotencyMismatchError,
  NotFoundError,
  ForbiddenError,
} from '../middleware/errorHandler';
import {
  reservationsConfirmedTotal,
  reservationsDeclinedTotal,
  reservationsIdempotentReplayTotal,
  seatsAvailableGauge,
  seatsConfirmedGauge,
} from '../metrics';

export interface ReserveInput {
  show_id: string;
  user_id: string;
  seats: string[];
  idempotency_key: string;
}

export interface ReservationResult {
  reservation_id: string;
  show_id: string;
  user_id: string;
  seats: string[];
  amount_paise: number;
  status: 'confirmed' | 'cancelled' | 'held';
  is_replay?: boolean;
}

function computePayloadHash(showId: string, seats: string[]): string {
  const canonical = JSON.stringify({
    show_id: showId,
    seats: [...seats].sort(),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export async function reserveSeats(input: ReserveInput): Promise<{ status: number; body: ReservationResult }> {
  const { show_id, user_id, idempotency_key } = input;

  // Validation
  if (!show_id || typeof show_id !== 'string') {
    throw new AppError('show_id is required', 400, 'INVALID_INPUT');
  }
  if (!user_id || typeof user_id !== 'string') {
    throw new AppError('user_id is required and must come from auth token', 400, 'INVALID_INPUT');
  }
  if (!idempotency_key || typeof idempotency_key !== 'string') {
    throw new AppError('idempotency_key is required', 400, 'INVALID_INPUT');
  }
  if (!Array.isArray(input.seats) || input.seats.length === 0) {
    throw new AppError('seats array must contain at least one seat', 400, 'INVALID_INPUT');
  }

  // Deduplicate and deterministically sort seat names to eliminate deadlock potential
  const sortedSeats = Array.from(new Set(input.seats.map((s) => String(s).trim()))).sort();
  if (sortedSeats.length === 0) {
    throw new AppError('No valid seats provided', 400, 'INVALID_INPUT');
  }

  const payloadHash = computePayloadHash(show_id, sortedSeats);

  return withTransaction(async (client) => {
    // 1. Idempotency Check (Row Lock to serialize identical retries)
    const existingIdemRes = await client.query(
      `SELECT request_hash, response_status, response_body
       FROM idempotency_keys
       WHERE show_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [show_id, idempotency_key]
    );

    if (existingIdemRes.rowCount && existingIdemRes.rowCount > 0) {
      const record = existingIdemRes.rows[0];
      if (record.request_hash === payloadHash) {
        // Exact match replay: return previous response
        reservationsIdempotentReplayTotal.inc({ show_id });
        return {
          status: record.response_status,
          body: {
            ...record.response_body,
            is_replay: true,
          },
        };
      } else {
        // Different payload with same key: clean decline 409
        reservationsDeclinedTotal.inc({ reason: 'idempotent_mismatch', show_id });
        throw new IdempotencyMismatchError(
          'Idempotency key was previously used with a different seat selection'
        );
      }
    }

    // 2. Fetch Show details & verify show exists
    const showRes = await client.query(
      `SELECT id, price_paise, per_user_limit
       FROM shows
       WHERE id = $1`,
      [show_id]
    );

    if (showRes.rowCount === 0) {
      throw new NotFoundError(`Show with ID ${show_id} not found`);
    }

    const show = showRes.rows[0];
    const perUserLimit = show.per_user_limit;

    // 3. Check Per-User Limit under concurrency
    // Count user's current seats for this show (held or confirmed)
    const userSeatsRes = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM seats
       WHERE show_id = $1 AND user_id = $2 AND status IN ('held', 'confirmed')`,
      [show_id, user_id]
    );

    const currentUserSeatsCount = userSeatsRes.rows[0].count;
    if (currentUserSeatsCount + sortedSeats.length > perUserLimit) {
      // Clean decline: domain outcome, NOT 500 error
      reservationsDeclinedTotal.inc({ reason: 'per_user_limit', show_id });
      throw new UserLimitExceededError(
        `Per-user limit of ${perUserLimit} seats exceeded for this show (currently holding ${currentUserSeatsCount}, requested ${sortedSeats.length})`,
        {
          per_user_limit: perUserLimit,
          currently_held: currentUserSeatsCount,
          requested: sortedSeats.length,
        }
      );
    }

    // 4. Lock Requested Seats Deterministically (Deadlock-Free Row Lock)
    // ORDER BY seat_number ASC guarantees strict global acquisition ordering
    const seatsRes = await client.query(
      `SELECT seat_number, status, user_id
       FROM seats
       WHERE show_id = $1 AND seat_number = ANY($2)
       ORDER BY seat_number ASC
       FOR UPDATE`,
      [show_id, sortedSeats]
    );

    // Verify all requested seats exist in this show
    if (seatsRes.rowCount !== sortedSeats.length) {
      const foundSeats = new Set(seatsRes.rows.map((r: any) => r.seat_number));
      const missingSeats = sortedSeats.filter((s) => !foundSeats.has(s));
      reservationsDeclinedTotal.inc({ reason: 'seat_not_found', show_id });
      throw new AppError(
        `Seats do not exist in this show: ${missingSeats.join(', ')}`,
        409,
        'SEAT_NOT_FOUND',
        { missing_seats: missingSeats }
      );
    }

    // 5. Verify availability (All-or-Nothing policy)
    const takenSeats = seatsRes.rows.filter((r: any) => r.status !== 'available');
    if (takenSeats.length > 0) {
      // Contention race lost: clean decline 409
      reservationsDeclinedTotal.inc({ reason: 'seat_taken', show_id });
      throw new SeatTakenError(
        `Seat contention: seats already taken: ${takenSeats.map((s: any) => s.seat_number).join(', ')}`,
        {
          unavailable_seats: takenSeats.map((s: any) => s.seat_number),
        }
      );
    }

    // 6. Atomically confirm reservation
    const reservationId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const amountPaise = show.price_paise * sortedSeats.length;

    // Update seat rows
    await client.query(
      `UPDATE seats
       SET status = 'confirmed',
           user_id = $1,
           reservation_id = $2,
           confirmed_at = NOW(),
           updated_at = NOW()
       WHERE show_id = $3 AND seat_number = ANY($4)`,
      [user_id, reservationId, show_id, sortedSeats]
    );

    // Insert reservation row
    await client.query(
      `INSERT INTO reservations (id, show_id, user_id, amount_paise, status, seats)
       VALUES ($1, $2, $3, $4, 'confirmed', $5)`,
      [reservationId, show_id, user_id, amountPaise, sortedSeats]
    );

    const responseBody: ReservationResult = {
      reservation_id: reservationId,
      show_id,
      user_id,
      seats: sortedSeats,
      amount_paise: amountPaise,
      status: 'confirmed',
    };

    // Store idempotency record
    await client.query(
      `INSERT INTO idempotency_keys (idempotency_key, show_id, request_hash, response_status, response_body)
       VALUES ($1, $2, $3, $4, $5)`,
      [idempotency_key, show_id, payloadHash, 201, JSON.stringify(responseBody)]
    );

    // Metrics update
    reservationsConfirmedTotal.inc({ show_id });

    return {
      status: 201,
      body: responseBody,
    };
  });
}

export async function cancelReservation(
  reservationId: string,
  requestingUserId: string
): Promise<{ message: string; reservation_id: string; freed_seats: string[] }> {
  if (!reservationId) {
    throw new AppError('reservation_id is required', 400, 'INVALID_INPUT');
  }

  return withTransaction(async (client) => {
    // 1. Lock reservation row
    const resResult = await client.query(
      `SELECT id, show_id, user_id, status, seats
       FROM reservations
       WHERE id = $1
       FOR UPDATE`,
      [reservationId]
    );

    if (resResult.rowCount === 0) {
      throw new NotFoundError(`Reservation with ID ${reservationId} not found`);
    }

    const reservation = resResult.rows[0];

    // 2. Ownership check: only owner (or admin) can cancel
    if (reservation.user_id !== requestingUserId && requestingUserId !== 'admin') {
      throw new ForbiddenError('You can only cancel your own reservation');
    }

    if (reservation.status === 'cancelled') {
      return {
        message: 'Reservation is already cancelled',
        reservation_id: reservationId,
        freed_seats: reservation.seats,
      };
    }

    // 3. Mark reservation cancelled
    await client.query(
      `UPDATE reservations
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1`,
      [reservationId]
    );

    // 4. Release seats back to 'available'
    await client.query(
      `UPDATE seats
       SET status = 'available',
           user_id = NULL,
           reservation_id = NULL,
           updated_at = NOW()
       WHERE show_id = $1 AND reservation_id = $2`,
      [reservation.show_id, reservationId]
    );

    return {
      message: 'Reservation cancelled successfully and seats released to available',
      reservation_id: reservationId,
      freed_seats: reservation.seats,
    };
  });
}
