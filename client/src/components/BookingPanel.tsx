import React from 'react';
import { Ticket, RefreshCw, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { Show } from '../api';

interface Props {
  show: Show | null;
  selectedSeats: string[];
  idempotencyKey: string;
  onGenerateIdempotencyKey: () => void;
  setIdempotencyKey: (val: string) => void;
  onReserve: () => void;
  onClearSelection: () => void;
  isSubmitting: boolean;
  lastResponse: {
    status?: number;
    data?: any;
    error?: any;
  } | null;
}

export const BookingPanel: React.FC<Props> = ({
  show,
  selectedSeats,
  idempotencyKey,
  onGenerateIdempotencyKey,
  setIdempotencyKey,
  onReserve,
  onClearSelection,
  isSubmitting,
  lastResponse,
}) => {
  if (!show) return null;

  const totalPaise = show.price_paise * selectedSeats.length;
  const totalRupees = (totalPaise / 100).toFixed(2);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Ticket className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Reservation & Idempotency</h3>
        </div>
        <span className="text-xs text-slate-400">
          ₹{(show.price_paise / 100).toFixed(2)} / seat ({show.price_paise} paise)
        </span>
      </div>

      {/* Selected Seats summary */}
      <div>
        <div className="flex justify-between items-center text-xs mb-2">
          <span className="text-slate-400">Selected Seats:</span>
          {selectedSeats.length > 0 && (
            <button
              onClick={onClearSelection}
              className="text-rose-400 hover:text-rose-300 transition"
            >
              Clear selection
            </button>
          )}
        </div>
        <div className="min-h-[42px] p-2 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap gap-1.5 items-center">
          {selectedSeats.length === 0 ? (
            <span className="text-xs text-slate-500 italic">Click seats on the grid to select</span>
          ) : (
            selectedSeats.map((seat) => (
              <span
                key={seat}
                className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono text-xs font-semibold"
              >
                {seat}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Idempotency Key Control */}
      <div>
        <div className="flex justify-between items-center text-xs mb-1.5">
          <label className="text-slate-400 font-medium">Idempotency Key:</label>
          <button
            onClick={onGenerateIdempotencyKey}
            className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 transition text-[11px]"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Generate UUID</span>
          </button>
        </div>
        <input
          type="text"
          value={idempotencyKey}
          onChange={(e) => setIdempotencyKey(e.target.value)}
          placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-cyan-500 text-slate-200"
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Exact replay returns previous reservation. Altered body with same key yields clean 409 decline.
        </p>
      </div>

      {/* Pricing breakdown */}
      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Amount (Paise)</span>
          <span className="font-mono">{totalPaise} paise</span>
        </div>
        <div className="flex justify-between text-sm font-semibold text-slate-200">
          <span>Total Payable</span>
          <span className="text-cyan-400">₹{totalRupees}</span>
        </div>
      </div>

      {/* Action Button */}
      <button
        disabled={selectedSeats.length === 0 || isSubmitting}
        onClick={onReserve}
        className={`w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition shadow-md ${
          selectedSeats.length === 0 || isSubmitting
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold shadow-cyan-500/20'
        }`}
      >
        <Send className="w-3.5 h-3.5" />
        <span>{isSubmitting ? 'Processing Atomically...' : `Book ${selectedSeats.length} Seat(s)`}</span>
      </button>

      {/* Last Response Feedback Panel */}
      {lastResponse && (
        <div
          className={`p-3 rounded-lg border text-xs space-y-1 ${
            lastResponse.status === 201 || lastResponse.status === 200
              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
              : 'bg-amber-950/50 border-amber-800 text-amber-200'
          }`}
        >
          <div className="flex items-center space-x-1.5 font-semibold">
            {lastResponse.status === 201 || lastResponse.status === 200 ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {lastResponse.data?.is_replay
                    ? '200 OK (Idempotent Replay Served)'
                    : '201 Created (Confirmed)'}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>Clean Decline: {lastResponse.status} {lastResponse.error?.error || 'Conflict'}</span>
              </>
            )}
          </div>
          <p className="text-[11px] opacity-90">
            {lastResponse.error?.message ||
              `Reservation ID: ${lastResponse.data?.reservation_id || 'N/A'}`}
          </p>
        </div>
      )}
    </div>
  );
};
