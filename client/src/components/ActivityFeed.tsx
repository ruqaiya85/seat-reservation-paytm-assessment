import React from 'react';
import { History, CheckCircle2, XCircle, RotateCcw, AlertOctagon } from 'lucide-react';

export interface ActivityItem {
  id: string;
  timestamp: string;
  type: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'REPLAY';
  message: string;
  seats?: string[];
  userId?: string;
  reservationId?: string;
}

interface Props {
  activities: ActivityItem[];
  onCancelReservation?: (resId: string) => void;
  currentUserId: string;
}

export const ActivityFeed: React.FC<Props> = ({
  activities,
  onCancelReservation,
  currentUserId,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col h-full max-h-[380px]">
      <div className="flex items-center space-x-2 pb-3 border-b border-slate-800 mb-2">
        <History className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-slate-200">Live Activity & Audit Stream</h3>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {activities.length === 0 ? (
          <p className="text-xs text-slate-500 italic text-center py-6">
            No reservation activity recorded yet.
          </p>
        ) : (
          activities.map((act) => {
            const isMine = act.userId === currentUserId;

            return (
              <div
                key={act.id}
                className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs flex items-start justify-between space-x-2"
              >
                <div className="flex items-start space-x-2">
                  {act.type === 'CONFIRMED' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  )}
                  {act.type === 'DECLINED' && (
                    <AlertOctagon className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  )}
                  {act.type === 'REPLAY' && (
                    <RotateCcw className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                  )}
                  {act.type === 'CANCELLED' && (
                    <XCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  )}

                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-slate-200">{act.message}</span>
                      {act.userId && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                          {act.userId}
                        </span>
                      )}
                    </div>
                    {act.seats && act.seats.length > 0 && (
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Seats: {act.seats.join(', ')}
                      </p>
                    )}
                    <span className="text-[10px] text-slate-500">{act.timestamp}</span>
                  </div>
                </div>

                {/* Cancel button if this is a confirmed reservation belonging to this user */}
                {act.type === 'CONFIRMED' && act.reservationId && isMine && onCancelReservation && (
                  <button
                    onClick={() => onCancelReservation(act.reservationId!)}
                    className="text-[11px] px-2 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 transition shrink-0"
                  >
                    Release / Cancel
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
