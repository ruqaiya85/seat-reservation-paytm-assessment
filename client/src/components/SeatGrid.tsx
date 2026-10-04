import React from 'react';
import { SeatDetail } from '../api';

interface Props {
  seats: SeatDetail[];
  selectedSeats: string[];
  onToggleSeat: (seatNumber: string) => void;
  currentUserId: string;
}

export const SeatGrid: React.FC<Props> = ({
  seats,
  selectedSeats,
  onToggleSeat,
  currentUserId,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      {/* Screen / Stage visualization */}
      <div className="mb-8">
        <div className="w-3/4 mx-auto h-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 rounded-full shadow-lg shadow-cyan-500/30"></div>
        <p className="text-center text-[11px] uppercase tracking-widest text-slate-400 mt-2 font-semibold">
          Stage / Screen
        </p>
      </div>

      {/* Seat Matrix Grid */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 sm:gap-2.5 max-h-[440px] overflow-y-auto p-2">
        {seats.map((seat) => {
          const isSelected = selectedSeats.includes(seat.seat_number);
          const isAvailable = seat.status === 'available';
          const isConfirmed = seat.status === 'confirmed';
          const isHeld = seat.status === 'held';
          const isMine = seat.user_id === currentUserId;

          let btnClass = 'bg-slate-800 text-slate-400 cursor-not-allowed border-slate-700';

          if (isSelected) {
            btnClass =
              'bg-cyan-500 text-slate-950 font-bold border-cyan-300 ring-2 ring-cyan-400 shadow-md shadow-cyan-500/40 scale-105';
          } else if (isAvailable) {
            btnClass =
              'bg-emerald-950/60 hover:bg-emerald-800/80 text-emerald-300 border-emerald-700/60 hover:scale-105 cursor-pointer';
          } else if (isConfirmed) {
            btnClass = isMine
              ? 'bg-purple-950/80 text-purple-300 border-purple-700 cursor-not-allowed font-medium'
              : 'bg-rose-950/70 text-rose-300/70 border-rose-900/60 cursor-not-allowed';
          } else if (isHeld) {
            btnClass = 'bg-amber-950/80 text-amber-300 border-amber-700 cursor-not-allowed';
          }

          return (
            <button
              key={seat.seat_number}
              disabled={!isAvailable && !isSelected}
              onClick={() => onToggleSeat(seat.seat_number)}
              title={`Seat ${seat.seat_number} - ${seat.status}${seat.user_id ? ` (by ${seat.user_id})` : ''}`}
              className={`h-10 sm:h-11 rounded-lg border text-xs flex flex-col items-center justify-center transition-all duration-150 select-none relative group ${btnClass}`}
            >
              <span className="font-mono font-semibold">{seat.seat_number}</span>
              {isConfirmed && (
                <span className="text-[9px] scale-90 text-rose-400">
                  {isMine ? 'You' : 'Sold'}
                </span>
              )}
              {isHeld && <span className="text-[9px] scale-90 text-amber-400">Hold</span>}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-300">
        <div className="flex items-center space-x-2">
          <div className="w-3.5 h-3.5 rounded bg-emerald-950 border border-emerald-600"></div>
          <span>Available</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3.5 h-3.5 rounded bg-cyan-500 border border-cyan-300"></div>
          <span>Selected</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3.5 h-3.5 rounded bg-amber-950 border border-amber-600"></div>
          <span>Held</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3.5 h-3.5 rounded bg-rose-950 border border-rose-800"></div>
          <span>Confirmed (Sold)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3.5 h-3.5 rounded bg-purple-950 border border-purple-600"></div>
          <span>Your Seats</span>
        </div>
      </div>
    </div>
  );
};
