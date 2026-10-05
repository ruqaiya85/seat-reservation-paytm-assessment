import React from 'react';
import { User } from 'lucide-react';

interface Props {
  userId: string;
  onChangeUser: (newUserId: string) => void;
  token?: string;
  perUserLimit: number;
  currentBookedCount: number;
}

const PRESET_USERS = ['alice', 'bob', 'charlie', 'david'];

export const UserSwitcher: React.FC<Props> = ({
  userId,
  onChangeUser,
  perUserLimit,
  currentBookedCount,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <User className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">User Identity (Token-Derived)</h3>
        </div>
        <span className="text-[11px] text-slate-400">Limit: {perUserLimit} seats/show</span>
      </div>

      {/* Preset User Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESET_USERS.map((u) => {
          const isActive = u === userId;
          return (
            <button
              key={u}
              onClick={() => onChangeUser(u)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${isActive
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
            >
              {u}
            </button>
          );
        })}
      </div>

      {/* Custom User ID Input */}
      <div className="flex items-center space-x-2 mb-3">
        <input
          type="text"
          value={userId}
          onChange={(e) => onChangeUser(e.target.value)}
          placeholder="Custom user ID"
          className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-cyan-500 text-slate-200"
        />
      </div>

      {/* Quota Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-400">Current User Allocation</span>
          <span
            className={`font-mono font-semibold ${currentBookedCount >= perUserLimit ? 'text-amber-400' : 'text-slate-300'
              }`}
          >
            {currentBookedCount} / {perUserLimit} seats
          </span>
        </div>
        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${currentBookedCount >= perUserLimit ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
            style={{
              width: `${Math.min(100, (currentBookedCount / perUserLimit) * 100)}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
