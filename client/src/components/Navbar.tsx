import React from 'react';
import { BarChart3, Database, RefreshCw } from 'lucide-react';

interface NavbarProps {
  dbStatus: 'READY' | 'NOT_READY' | 'CHECKING';
  onRefresh: () => void;
  openCreateModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ dbStatus, onRefresh, openCreateModal }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <span className="font-extrabold text-white text-lg tracking-wider">PM</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white text-lg tracking-tight">Paytm Money</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                Scale Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">Atomic Seat Reservation & Observability System</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* DB Health Status */}
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">DB:</span>
            {dbStatus === 'READY' ? (
              <span className="flex items-center text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                Connected
              </span>
            ) : dbStatus === 'NOT_READY' ? (
              <span className="flex items-center text-rose-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-400 mr-1.5"></span>
                Disconnected
              </span>
            ) : (
              <span className="text-amber-400">Checking...</span>
            )}
          </div>

          {/* Prometheus Metrics Link */}
          <a
            href="/metrics"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 transition"
          >
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Metrics</span>
          </a>

          {/* Quick refresh button */}
          <button
            onClick={onRefresh}
            title="Refresh State"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Create Show Button */}
          <button
            onClick={openCreateModal}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition flex items-center space-x-1.5"
          >
            <span>+ New Show</span>
          </button>
        </div>
      </div>
    </header>
  );
};
