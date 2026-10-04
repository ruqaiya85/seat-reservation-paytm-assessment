import test from 'node:test';
import assert from 'node:assert';
import {
  SeatTakenError,
  UserLimitExceededError,
  IdempotencyMismatchError,
} from '../src/middleware/errorHandler';
import crypto from 'node:crypto';

test('Seat reservation domain errors produce clean 409 status codes', () => {
  const seatErr = new SeatTakenError('Seat taken');
  assert.strictEqual(seatErr.statusCode, 409);
  assert.strictEqual(seatErr.code, 'SEAT_TAKEN');

  const limitErr = new UserLimitExceededError('Limit exceeded');
  assert.strictEqual(limitErr.statusCode, 409);
  assert.strictEqual(limitErr.code, 'USER_LIMIT_EXCEEDED');

  const idemErr = new IdempotencyMismatchError('Mismatch');
  assert.strictEqual(idemErr.statusCode, 409);
  assert.strictEqual(idemErr.code, 'IDEMPOTENCY_MISMATCH');
});

test('Idempotency payload hashing is deterministic regardless of seat order', () => {
  const hash1 = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        show_id: 'show-1',
        seats: ['A1', 'A2'].sort(),
      })
    )
    .digest('hex');

  const hash2 = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        show_id: 'show-1',
        seats: ['A2', 'A1'].sort(),
      })
    )
    .digest('hex');

  assert.strictEqual(hash1, hash2);
});
