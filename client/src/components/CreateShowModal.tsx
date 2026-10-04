import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { createShowApi } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (showId: string) => void;
}

export const CreateShowModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('friday-night-show');
  const [pricePaise, setPricePaise] = useState(25000);
  const [perUserLimit, setPerUserLimit] = useState(4);
  const [seatCountPreset, setSeatCountPreset] = useState<'40' | '60' | '100'>('60');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const generateSeatNames = (count: number): string[] => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
    const cols = 10;
    const seats: string[] = [];
    let added = 0;

    for (const r of rows) {
      for (let c = 1; c <= cols; c++) {
        if (added >= count) break;
        seats.push(`${r}${c}`);
        added++;
      }
      if (added >= count) break;
    }
    return seats;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const seats = generateSeatNames(parseInt(seatCountPreset, 10));
      const created = await createShowApi({
        name,
        seats,
        price_paise: Number(pricePaise),
        per_user_limit: Number(perUserLimit),
      });
      onSuccess(created.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create show');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 mb-4">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">Create New Show</h2>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Show Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-cyan-500 text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Ticket Price (paise)
              </label>
              <input
                type="number"
                required
                min="0"
                value={pricePaise}
                onChange={(e) => setPricePaise(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-cyan-500 text-slate-100"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                ₹{(pricePaise / 100).toFixed(2)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Per-User Limit
              </label>
              <input
                type="number"
                required
                min="1"
                max="20"
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-cyan-500 text-slate-100"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Default: 4 seats</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Seat Layout</label>
            <div className="grid grid-cols-3 gap-2">
              {(['40', '60', '100'] as const).map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setSeatCountPreset(preset)}
                  className={`py-2 text-xs rounded-lg border font-medium transition ${
                    seatCountPreset === preset
                      ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {preset} Seats
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Show...' : 'Create Show & Generate Seats'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
