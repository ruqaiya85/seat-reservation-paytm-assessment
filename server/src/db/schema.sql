-- Schema for Paytm Money Seat Reservation System

CREATE TABLE IF NOT EXISTS shows (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    per_user_limit INTEGER NOT NULL DEFAULT 4 CHECK (per_user_limit > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seats (
    id SERIAL PRIMARY KEY,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    seat_number VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('available', 'held', 'confirmed')),
    user_id VARCHAR(128),
    reservation_id VARCHAR(64),
    held_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_show_seat UNIQUE (show_id, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_seats_show_status ON seats(show_id, status);
CREATE INDEX IF NOT EXISTS idx_seats_show_user ON seats(show_id, user_id);

CREATE TABLE IF NOT EXISTS reservations (
    id VARCHAR(64) PRIMARY KEY,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL,
    amount_paise INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('confirmed', 'cancelled', 'held')),
    seats TEXT[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reservations_show_user ON reservations(show_id, user_id);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key VARCHAR(128) NOT NULL,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    request_hash VARCHAR(64) NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (show_id, idempotency_key)
);
