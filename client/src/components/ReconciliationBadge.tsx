import React from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { Show } from '../api';

interface Props {
  show: Show | null;
}

export const ReconciliationBadge: React.FC<Props> = ({ show }) => {
  if (!show) return null;

  const sum = show.available_seats + show.held_seats + show.confirmed_seats;
  const isConsistent = sum === show.total_seats;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {isConsistent ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce" />
          )}
          <h3 className="text-sm font-semibold text-slate-200">System Reconciliation Invariant</h3>
        </div>

        <div
          className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center space-x-1.5 ${
            isConsistent
              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
              : 'bg-rose-950/80 text-rose-400 border border-rose-800 animate-pulse'
          }`}
        >
          <span>{isConsistent ? 'PASS: Invariant Holds' : 'FAIL: Discrepancy Detected'}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-900/50">
          <p className="text-emerald-400 font-bold text-base">{show.available_seats}</p>
          <p className="text-slate-400 text-[11px]">Available</p>
        </div>
        <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-900/50">
          <p className="text-amber-400 font-bold text-base">{show.held_seats}</p>
          <p className="text-slate-400 text-[11px]">Held</p>
        </div>
        <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-900/50">
          <p className="text-rose-400 font-bold text-base">{show.confirmed_seats}</p>
          <p className="text-slate-400 text-[11px]">Confirmed</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-800/60 border border-slate-700">
          <p className="text-cyan-400 font-bold text-base">{show.total_seats}</p>
          <p className="text-slate-400 text-[11px]">Total Seats</p>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span>Formula: available + held + confirmed == total_seats</span>
        <span className={isConsistent ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
          {show.available_seats} + {show.held_seats} + {show.confirmed_seats} = {sum} / {show.total_seats}
        </span>
      </div>
    </div>
  );
};
