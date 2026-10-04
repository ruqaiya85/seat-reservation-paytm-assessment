export interface SeatDetail {
  seat_number: string;
  status: 'available' | 'held' | 'confirmed';
  user_id?: string | null;
  reservation_id?: string | null;
}

export interface Show {
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

export interface ReservationResponse {
  reservation_id: string;
  show_id: string;
  user_id: string;
  seats: string[];
  amount_paise: number;
  status: 'confirmed' | 'cancelled' | 'held';
  is_replay?: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  details?: any;
  request_id?: string;
}

const API_BASE = '';

export async function fetchShows(): Promise<Show[]> {
  const res = await fetch(`${API_BASE}/shows`);
  if (!res.ok) throw new Error('Failed to load shows');
  return res.json();
}

export async function fetchShow(id: string): Promise<Show> {
  const res = await fetch(`${API_BASE}/shows/${id}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to fetch show details');
  }
  return res.json();
}

export async function createShowApi(data: {
  name: string;
  seats: string[];
  price_paise: number;
  per_user_limit?: number;
}): Promise<Show> {
  const res = await fetch(`${API_BASE}/shows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw json;
  return json;
}

export async function reserveSeatsApi(
  showId: string,
  seats: string[],
  idempotencyKey: string,
  token: string
): Promise<{ data?: ReservationResponse; error?: ApiError; status: number }> {
  const res = await fetch(`${API_BASE}/shows/${showId}/reserve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ seats }),
  });

  const json = await res.json();
  if (!res.ok) {
    return { error: json, status: res.status };
  }
  return { data: json, status: res.status };
}

export async function cancelReservationApi(
  reservationId: string,
  token: string
): Promise<{ message: string; reservation_id: string; freed_seats: string[] }> {
  const res = await fetch(`${API_BASE}/reservations/${reservationId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  const json = await res.json();
  if (!res.ok) throw json;
  return json;
}

export async function fetchHealth(): Promise<{ status: string; dependencies?: any }> {
  const res = await fetch(`${API_BASE}/health/ready`);
  return res.json();
}
