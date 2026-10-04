#!/usr/bin/env bash
# One-command burst test runner for Paytm Money Seat Reservation at Scale
set -e

BASE_URL="${1:-http://localhost:3000}"

echo "=========================================================="
echo "Starting Seat Reservation Concurrency Burst against: $BASE_URL"
echo "=========================================================="

npx tsx scripts/burst.ts "$BASE_URL"
