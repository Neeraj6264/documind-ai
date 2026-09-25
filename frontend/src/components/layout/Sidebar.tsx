import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Settings,
  ShieldCheck,
  Building2,
  ChevronDown,
  Plus,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.js';
import { api } from '../../services/api.js';

export const Sidebar: React.FC = () => {
  const { user, activeOrg, organizations, setActiveOrg, logout, refreshOrganizations } = useAuth();
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const navigate = useNavigate();

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    try {
      const created = await api.createOrganization({ name: newOrgName.trim() });
      await refreshOrganizations();
      setActiveOrg(created);
      setIsCreatingOrg(false);
      setNewOrgName('');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const navItems = [
    { label: 'Overview', to: '/', icon: LayoutDashboard },
    { label: 'Documents', to: '/documents', icon: FileText },
    { label: 'AI Document Chat', to: '/chat', icon: MessageSquare },
    { label: 'Workspace Settings', to: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900/90 backdrop-blur-xl border-r border-slate-800 flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
              DocuMind <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono">AI</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Multi-Tenant SaaS</p>
          </div>
        </div>
      </div>

      {/* Tenant / Workspace Selector */}
      <div className="p-3 border-b border-slate-800/60 relative">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 block mb-1">
          Active Workspace
        </label>
        <button
          onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-left border border-slate-700/50 transition-all text-xs font-medium text-slate-200"
        >
          <div className="flex items-center gap-2 truncate">
            <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="truncate">{activeOrg?.name || 'Select Workspace'}</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
        </button>

        {/* Dropdown Menu */}
        {isOrgDropdownOpen && (
          <div className="absolute top-full left-3 right-3 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-50">
            <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Your Workspaces
            </div>
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => {
                  setActiveOrg(org);
                  setIsOrgDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800 transition-colors ${
                  activeOrg?.id === org.id ? 'text-indigo-400 font-semibold bg-indigo-500/10' : 'text-slate-300'
                }`}
              >
                <span className="truncate">{org.name}</span>
                {activeOrg?.id === org.id && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>}
              </button>
            ))}

            <div className="border-t border-slate-800 mt-1 pt-1">
              {!isCreatingOrg ? (
                <button
                  onClick={() => setIsCreatingOrg(true)}
                  className="w-full text-left px-3 py-1.5 text-xs text-indigo-400 hover:bg-slate-800/80 flex items-center gap-2 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create New Workspace
                </button>
              ) : (
                <form onSubmit={handleCreateOrg} className="p-2 space-y-1.5">
                  <input
                    type="text"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="Workspace name"
                    className="w-full px-2 py-1 text-xs rounded bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsCreatingOrg(false)}
                      className="px-2 py-0.5 text-[11px] rounded text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-0.5 text-[11px] rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                    >
                      Create
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Tenant Isolation Badge */}
      <div className="p-3 mx-3 mb-2 rounded-xl bg-slate-950/60 border border-slate-800/80">
        <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-semibold">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Tenant Isolated</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
          Vector search & documents strictly scoped to <span className="text-slate-200 font-mono">{activeOrg?.slug || 'workspace'}</span>.
        </p>
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold text-xs flex items-center justify-center shrink-0 border border-indigo-500/30">
            {user?.name?.slice(0, 2).toUpperCase() || 'DM'}
          </div>
          <div className="truncate">
            <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>

        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          title="Sign Out"
          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
