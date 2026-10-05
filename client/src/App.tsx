import { useState, useEffect, useCallback } from 'react';
import {
  fetchShows,
  fetchShow,
  reserveSeatsApi,
  cancelReservationApi,
  fetchHealth,
  Show,
} from './api';
import { Navbar } from './components/Navbar';
import { ReconciliationBadge } from './components/ReconciliationBadge';
import { SeatGrid } from './components/SeatGrid';
import { UserSwitcher } from './components/UserSwitcher';
import { BookingPanel } from './components/BookingPanel';
import { ActivityFeed, ActivityItem } from './components/ActivityFeed';
import { CreateShowModal } from './components/CreateShowModal';
import { ChevronDown, RefreshCw, Calendar } from 'lucide-react';

export function App() {
  const [shows, setShows] = useState<Show[]>([]);
  const [currentShowId, setCurrentShowId] = useState<string | null>(null);
  const [currentShow, setCurrentShow] = useState<Show | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [userId, setUserId] = useState('alice');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    crypto.randomUUID()
  );
  const [dbStatus, setDbStatus] = useState<'READY' | 'NOT_READY' | 'CHECKING'>('CHECKING');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Generate new UUID for idempotency
  const generateNewIdempotencyKey = () => {
    setIdempotencyKey(crypto.randomUUID());
  };

  // Check backend health
  const checkHealth = useCallback(async () => {
    try {
      const h = await fetchHealth();
      setDbStatus(h.status === 'READY' ? 'READY' : 'NOT_READY');
    } catch {
      setDbStatus('NOT_READY');
    }
  }, []);

  // Refresh current show data
  const loadShowDetails = useCallback(async (id: string) => {
    try {
      const showData = await fetchShow(id);
      setCurrentShow(showData);
    } catch (err) {
      console.error('Failed to load show:', err);
    }
  }, []);

  // Load all shows
  const loadShows = useCallback(async () => {
    try {
      const list = await fetchShows();
      setShows(list);
      if (list.length > 0 && !currentShowId) {
        setCurrentShowId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load shows:', err);
    }
  }, [currentShowId]);

  useEffect(() => {
    checkHealth();
    loadShows();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth, loadShows]);

  useEffect(() => {
    if (currentShowId) {
      loadShowDetails(currentShowId);
      // Auto-poll show state every 3 seconds for live concurrency updates
      const poll = setInterval(() => {
        loadShowDetails(currentShowId);
      }, 3000);
      return () => clearInterval(poll);
    }
  }, [currentShowId, loadShowDetails]);

  // Toggle seat selection
  const handleToggleSeat = (seatNum: string) => {
    setSelectedSeats((prev) =>
      prev.includes(seatNum) ? prev.filter((s) => s !== seatNum) : [...prev, seatNum]
    );
  };

  // Reserve action
  const handleReserve = async () => {
    if (!currentShowId || selectedSeats.length === 0) return;
    setIsSubmitting(true);
    setLastResponse(null);

    try {
      const res = await reserveSeatsApi(
        currentShowId,
        selectedSeats,
        idempotencyKey,
        userId // token-derived identity
      );

      setLastResponse(res);

      const now = new Date().toLocaleTimeString();

      if (res.status === 201) {
        setActivities((prev) => [
          {
            id: crypto.randomUUID(),
            timestamp: now,
            type: 'CONFIRMED',
            message: `Confirmed ${selectedSeats.length} seat(s)`,
            seats: [...selectedSeats],
            userId,
            reservationId: res.data?.reservation_id,
          },
          ...prev.slice(0, 40),
        ]);
        setSelectedSeats([]);
        // Generate fresh key for subsequent distinct bookings
        generateNewIdempotencyKey();
      } else if (res.status === 200 && res.data?.is_replay) {
        setActivities((prev) => [
          {
            id: crypto.randomUUID(),
            timestamp: now,
            type: 'REPLAY',
            message: `Idempotent replay served`,
            seats: [...selectedSeats],
            userId,
            reservationId: res.data?.reservation_id,
          },
          ...prev.slice(0, 40),
        ]);
      } else {
        // Clean decline (409)
        setActivities((prev) => [
          {
            id: crypto.randomUUID(),
            timestamp: now,
            type: 'DECLINED',
            message: `Declined: ${res.error?.error || 'Conflict'}`,
            seats: [...selectedSeats],
            userId,
          },
          ...prev.slice(0, 40),
        ]);
      }

      await loadShowDetails(currentShowId);
    } catch (err: any) {
      setLastResponse({
        status: 500,
        error: { message: err?.message || 'Network request failed' },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel reservation
  const handleCancelReservation = async (reservationId: string) => {
    try {
      const res = await cancelReservationApi(reservationId, userId);
      const now = new Date().toLocaleTimeString();
      setActivities((prev) => [
        {
          id: crypto.randomUUID(),
          timestamp: now,
          type: 'CANCELLED',
          message: `Reservation released`,
          seats: res.freed_seats,
          userId,
          reservationId,
        },
        ...prev.slice(0, 40),
      ]);
      if (currentShowId) {
        await loadShowDetails(currentShowId);
      }
    } catch (err: any) {
      alert(`Cancellation failed: ${err?.message || 'Forbidden'}`);
    }
  };

  // Calculate current booked seats for this user in current show
  const currentBookedCount =
    currentShow?.seats.filter(
      (s) => s.user_id === userId && (s.status === 'confirmed' || s.status === 'held')
    ).length || 0;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <Navbar
        dbStatus={dbStatus}
        onRefresh={() => currentShowId && loadShowDetails(currentShowId)}
        openCreateModal={() => setIsCreateModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Show Selector & Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Active Event
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-medium">
                  On Sale
                </span>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {currentShow ? currentShow.name : 'No show selected'}
              </h1>
            </div>
          </div>

          {/* Select show dropdown */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <select
                value={currentShowId || ''}
                onChange={(e) => {
                  setCurrentShowId(e.target.value);
                  setSelectedSeats([]);
                }}
                className="appearance-none bg-slate-950 text-slate-200 border border-slate-800 rounded-xl px-4 py-2.5 pr-10 text-xs font-semibold focus:outline-none focus:border-cyan-500 cursor-pointer shadow-sm"
              >
                {shows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.available_seats}/{s.total_seats} avail)
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>

            <button
              onClick={() => currentShowId && loadShowDetails(currentShowId)}
              title="Refresh Show"
              className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Reconciliation Invariant Bar */}
        <ReconciliationBadge show={currentShow} />

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Seat Grid (7 columns) */}
          <div className="lg:col-span-7">
            <SeatGrid
              seats={currentShow?.seats || []}
              selectedSeats={selectedSeats}
              onToggleSeat={handleToggleSeat}
              currentUserId={userId}
            />
          </div>

          {/* Right: Booking Panel & User Switcher & Activity (5 columns) */}
          <div className="lg:col-span-5 space-y-5">
            <UserSwitcher
              userId={userId}
              onChangeUser={setUserId}
              token={userId}
              perUserLimit={currentShow?.per_user_limit || 4}
              currentBookedCount={currentBookedCount}
            />

            <BookingPanel
              show={currentShow}
              selectedSeats={selectedSeats}
              idempotencyKey={idempotencyKey}
              onGenerateIdempotencyKey={generateNewIdempotencyKey}
              setIdempotencyKey={setIdempotencyKey}
              onReserve={handleReserve}
              onClearSelection={() => setSelectedSeats([])}
              isSubmitting={isSubmitting}
              lastResponse={lastResponse}
            />

            <ActivityFeed
              activities={activities}
              onCancelReservation={handleCancelReservation}
              currentUserId={userId}
            />
          </div>
        </div>
      </main>

      {/* Modal for creating a new show */}
      <CreateShowModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(newShowId) => {
          loadShows();
          setCurrentShowId(newShowId);
        }}
      />
    </div>
  );
}

export default App;
