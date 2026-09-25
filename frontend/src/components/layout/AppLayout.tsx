import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { useAuth } from '../../contexts/AuthContext.js';

export const AppLayout: React.FC = () => {
  const { activeOrg } = useAuth();

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top subtle bar */}
        <header className="h-14 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">Active Organization:</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700/60 text-indigo-300">
              {activeOrg?.name || 'No Active Workspace'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              pgvector Engine Ready
            </div>
          </div>
        </header>

        {/* Dynamic Route Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
