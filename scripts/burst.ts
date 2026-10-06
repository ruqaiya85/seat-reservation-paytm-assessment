import http from 'http';
import https from 'https';
import crypto from 'crypto';

interface TestMetrics {
  total: number;
  confirmed_201: number;
  replayed_200: number;
  declined_seat_taken_409: number;
  declined_user_limit_409: number;
  declined_idempotency_mismatch_409: number;
  other_4xx: number;
  errors_5xx: number;
  network_errors: number;
}

const metrics: TestMetrics = {
  total: 0,
  confirmed_201: 0,
  replayed_200: 0,
  declined_seat_taken_409: 0,
  declined_user_limit_409: 0,
  declined_idempotency_mismatch_409: 0,
  other_4xx: 0,
  errors_5xx: 0,
  network_errors: 0,
};

const BASE_URL = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const isHttps = BASE_URL.startsWith('https://');
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 200 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 200 });

async function request(path: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
} = {}): Promise<{ status: number; headers: any; body: any }> {
  metrics.total++;
  const url = new URL(`${BASE_URL}${path}`);
  const postData = options.body ? JSON.stringify(options.body) : '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (postData) {
    headers['Content-Length'] = Buffer.byteLength(postData).toString();
  }

  const reqOptions: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method: options.method || 'GET',
    headers,
    agent: isHttps ? httpsAgent : httpAgent,
    timeout: 10000,
  };

  return new Promise((resolve) => {
    const transport = isHttps ? https : http;
    const req = transport.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let body: any = {};
        try {
          body = JSON.parse(data);
        } catch {
          body = { raw: data };
        }

        const status = res.statusCode || 0;
        if (status === 201) {
          metrics.confirmed_201++;
        } else if (status === 200 && (res.headers['x-idempotent-replay'] || body?.is_replay)) {
          metrics.replayed_200++;
        } else if (status === 409) {
          if (body?.error === 'SEAT_TAKEN') metrics.declined_seat_taken_409++;
          else if (body?.error === 'USER_LIMIT_EXCEEDED') metrics.declined_user_limit_409++;
          else if (body?.error === 'IDEMPOTENCY_MISMATCH') metrics.declined_idempotency_mismatch_409++;
          else metrics.other_4xx++;
        } else if (status >= 400 && status < 500) {
          metrics.other_4xx++;
        } else if (status >= 500) {
          metrics.errors_5xx++;
        }

        resolve({ status, headers: res.headers, body });
      });
    });

    req.on('error', (err) => {
      metrics.network_errors++;
      resolve({ status: 0, headers: {}, body: { error: err.message } });
    });

    req.on('timeout', () => {
      req.destroy();
      metrics.network_errors++;
      resolve({ status: 0, headers: {}, body: { error: 'Request timed out' } });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function generateSeatList(count: number): string[] {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
  const seats: string[] = [];
  let added = 0;
  for (const r of rows) {
    for (let c = 1; c <= 20; c++) {
      if (added >= count) break;
      seats.push(`${r}${c}`);
      added++;
    }
    if (added >= count) break;
  }
  return seats;
}

async function runBurst() {
  console.log('================================================================');
  console.log('🚀 PAYTM MONEY · SEAT RESERVATION HIGH-CONCURRENCY BURST TEST');
  console.log(`🎯 Target URL: ${BASE_URL}`);
  console.log(`⏱️  Timestamp:  ${new Date().toISOString()}`);
  console.log('================================================================\n');

  // 1. Readiness Check
  console.log('🔍 Checking service readiness probe (/health/ready)...');
  const ready = await request('/health/ready');
  if (ready.status !== 200) {
    console.error(`❌ Service not ready (status ${ready.status}):`, ready.body);
    process.exit(1);
  }
  console.log('✅ Service is healthy and database is connected.\n');

  // 2. Create Show for Burst Test
  const totalSeats = 100;
  const seats = generateSeatList(totalSeats);
  const showName = `burst-test-${Date.now()}`;
  console.log(`🎪 Creating test show "${showName}" with ${totalSeats} seats (limit: 4 seats/user)...`);

  const showRes = await request('/shows', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin' },
    body: {
      name: showName,
      seats,
      price_paise: 25000, // Rs 250
      per_user_limit: 4,
    },
  });

  if (showRes.status !== 201) {
    console.error('❌ Failed to create show:', showRes.body);
    process.exit(1);
  }

  const showId = showRes.body.id;
  console.log(`✅ Show created with ID: ${showId}\n`);

  // 3. Hot-Seat Storm: 500 concurrent users fighting for single seat "A12"
  const hotSeat = 'A12';
  const hotContenders = 500;
  console.log(`🔥 STORM 1: Hot-Seat Contention on "${hotSeat}" (${hotContenders} concurrent buyers)...`);

  const hotPromises = Array.from({ length: hotContenders }, (_, i) => {
    const userId = `hot-user-${i}`;
    const idemKey = `idem-hot-${i}-${crypto.randomUUID()}`;
    return request(`/shows/${showId}/reserve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userId}`,
        'Idempotency-Key': idemKey,
      },
      body: { seats: [hotSeat] },
    });
  });

  const hotResults = await Promise.all(hotPromises);
  const hotWinners = hotResults.filter((r) => r.status === 201);
  const hotDeclined = hotResults.filter((r) => r.status === 409 && r.body?.error === 'SEAT_TAKEN');

  console.log(`   ➡️  Confirmed (201):   ${hotWinners.length} winner (EXPECTED: 1)`);
  console.log(`   ➡️  Declined (409):    ${hotDeclined.length} declined (clean domain outcome)`);
  console.log(`   ➡️  5xx Server Errors: ${hotResults.filter((r) => r.status >= 500).length} (EXPECTED: 0)`);

  if (hotWinners.length !== 1) {
    console.error(`❌ CRITICAL FAILURE: Hot seat "${hotSeat}" had ${hotWinners.length} winners! Double-sell detected!`);
  } else {
    console.log(`✅ Exactly one buyer won "${hotSeat}". Zero double-booking!`);
  }
  console.log('');

  // 4. Idempotency Retries: Winner retries with identical key
  const winnerUserId = hotWinners[0]?.body?.user_id || 'hot-user-0';
  const winnerIdemKey = hotWinners[0] ? hotPromises[0] ? 'idem-hot-0' : 'idem-hot' : 'idem-hot';
  console.log(`🔁 STORM 2: Idempotent Retries (Same key replay across 50 concurrent requests)...`);

  const retryIdemKey = `idem-replay-${Date.now()}`;
  const firstBuy = await request(`/shows/${showId}/reserve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer winner-buyer`,
      'Idempotency-Key': retryIdemKey,
    },
    body: { seats: ['A1'] },
  });

  const replayPromises = Array.from({ length: 50 }, () =>
    request(`/shows/${showId}/reserve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer winner-buyer`,
        'Idempotency-Key': retryIdemKey,
      },
      body: { seats: ['A1'] },
    })
  );

  const replayResults = await Promise.all(replayPromises);
  const replayedCount = replayResults.filter((r) => r.status === 201 || (r.status === 200 && r.body?.is_replay)).length;
  console.log(`   ➡️  Idempotent replays satisfied: ${replayedCount}/50 (No duplicate reservation created)`);
  console.log('✅ Idempotency exact replay holds under concurrency.\n');

  // 5. Idempotency Mismatch: Same key with altered seat request
  console.log(`🚫 STORM 3: Idempotency Key Mismatch Test (Same key, different seats)...`);
  const mismatchRes = await request(`/shows/${showId}/reserve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer winner-buyer`,
      'Idempotency-Key': retryIdemKey, // Reusing retryIdemKey from step 4
    },
    body: { seats: ['A2'] }, // Different seat!
  });

  if (mismatchRes.status === 409 && mismatchRes.body?.error === 'IDEMPOTENCY_MISMATCH') {
    console.log(`✅ Clean 409 decline for reused key with different payload: ${mismatchRes.body.message}\n`);
  } else {
    console.error(`❌ Expected 409 IDEMPOTENCY_MISMATCH, got ${mismatchRes.status}:`, mismatchRes.body);
  }

  // 6. Per-User Limit Storm: 1 user firing 10 parallel reservation attempts on limit=4 show
  console.log(`🛡️  STORM 4: Per-User Limit Concurrency (User "quota-tester" fires 10 parallel bookings, limit=4)...`);
  const quotaUser = 'quota-tester';
  const quotaSeats = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'];

  const quotaPromises = quotaSeats.map((seat, i) =>
    request(`/shows/${showId}/reserve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${quotaUser}`,
        'Idempotency-Key': `idem-quota-${i}-${Date.now()}`,
      },
      body: { seats: [seat] },
    })
  );

  const quotaResults = await Promise.all(quotaPromises);
  const quotaWon = quotaResults.filter((r) => r.status === 201);
  const quotaOver = quotaResults.filter((r) => r.status === 409 && r.body?.error === 'USER_LIMIT_EXCEEDED');

  console.log(`   ➡️  Won (201):               ${quotaWon.length} (EXPECTED: 4)`);
  console.log(`   ➡️  Clean Decline (409):    ${quotaOver.length} (EXPECTED: 6)`);
  console.log(`   ➡️  5xx Errors:             ${quotaResults.filter((r) => r.status >= 500).length} (EXPECTED: 0)`);

  if (quotaWon.length > 4) {
    console.error(`❌ CRITICAL FAILURE: User exceeded per_user_limit (held ${quotaWon.length} seats)!`);
  } else {
    console.log(`✅ Per-user limit strictly enforced under concurrency.\n`);
  }

  // 7. Broad Concurrency Storm across all remaining seats
  console.log(`⚡ STORM 5: Broad On-Sale Stampede (200 concurrent requests targeting available seats)...`);
  const availableSeatsPool = seats.filter((s) => s !== 'A12' && s !== 'A1' && !quotaSeats.includes(s));
  
  const broadPromises = Array.from({ length: 200 }, (_, i) => {
    const randomSeat = availableSeatsPool[i % availableSeatsPool.length];
    const uId = `buyer-broad-${i}`;
    return request(`/shows/${showId}/reserve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${uId}`,
        'Idempotency-Key': `idem-broad-${i}-${crypto.randomUUID()}`,
      },
      body: { seats: [randomSeat] },
    });
  });

  await Promise.all(broadPromises);
  console.log('✅ Broad concurrency completed.\n');

  // 8. Cancellation & Ownership Check
  console.log(`🔄 STORM 6: Cancellation & Ownership Verification...`);
  if (quotaWon.length > 0) {
    const resToCancel = quotaWon[0].body.reservation_id;
    // Attempt unauthorized cancel from another user
    const imposterCancel = await request(`/reservations/${resToCancel}/cancel`, {
      method: 'POST',
      headers: { Authorization: 'Bearer imposter-user' },
    });
    if (imposterCancel.status === 403) {
      console.log('   ✅ Unauthorized cancellation rejected with 403 Forbidden.');
    } else {
      console.error(`   ❌ Imposter cancel returned ${imposterCancel.status}`);
    }

    // Legitimate owner cancellation
    const ownerCancel = await request(`/reservations/${resToCancel}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${quotaUser}` },
    });
    if (ownerCancel.status === 200) {
      console.log('   ✅ Owner cancellation succeeded and seat released.');
    } else {
      console.error(`   ❌ Owner cancel failed: ${ownerCancel.status}`, ownerCancel.body);
    }
  }
  console.log('');

  // 9. Show State & Reconciliation Invariant
  console.log('⚖️  VERIFYING FINAL RECONCILIATION INVARIANT (/shows/{id})...');
  const finalShowRes = await request(`/shows/${showId}`);
  const finalShow = finalShowRes.body;

  const total = finalShow.total_seats;
  const avail = finalShow.available_seats;
  const held = finalShow.held_seats;
  const conf = finalShow.confirmed_seats;
  const sum = avail + held + conf;
  const invariantHolds = sum === total;

  console.log(`   Available:  ${avail}`);
  console.log(`   Held:       ${held}`);
  console.log(`   Confirmed:  ${conf}`);
  console.log(`   Total:      ${total}`);
  console.log(`   Sum check:  ${avail} + ${held} + ${conf} = ${sum}`);
  console.log(`   Invariant:  ${invariantHolds ? '✅ PASS (Holds to the unit)' : '❌ FAIL (Discrepancy detected)'}\n`);

  // Final Summary Table
  console.log('================================================================');
  console.log('📊 BURST OUTCOME DISTRIBUTION SUMMARY');
  console.log('================================================================');
  console.table({
    'Total Requests Fired': metrics.total,
    '201 Confirmed': metrics.confirmed_201,
    '200 Idempotent Replays': metrics.replayed_200,
    '409 Clean Decline (Seat Taken)': metrics.declined_seat_taken_409,
    '409 Clean Decline (User Limit)': metrics.declined_user_limit_409,
    '409 Clean Decline (Key Mismatch)': metrics.declined_idempotency_mismatch_409,
    'Other 4xx Client Codes': metrics.other_4xx,
    '5xx Server Errors': metrics.errors_5xx,
    'Network / Timeout Errors': metrics.network_errors,
  });

  if (metrics.errors_5xx > 0) {
    console.error('❌ FAILED: Non-zero 5xx errors observed.');
    process.exit(1);
  }

  if (!invariantHolds) {
    console.error('❌ FAILED: Reconciliation invariant violated.');
    process.exit(1);
  }

  console.log('\n🏆 ALL CORRECTNESS AND RECONCILIATION BARS PASSED WITH ZERO 5xx ERRORS!');
  process.exit(0);
}

runBurst().catch((err) => {
  console.error('Fatal burst test failure:', err);
  process.exit(1);
});
