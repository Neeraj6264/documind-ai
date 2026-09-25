import React, { useEffect, useState } from 'react';
import {
  Settings,
  Users,
  Sliders,
  ShieldCheck,
  UserPlus,
  Trash2,
  Save,
  Check,
} from 'lucide-react';
import { api } from '../services/api.js';
import { OrganizationMember } from '../types/index.js';
import { useAuth } from '../contexts/AuthContext.js';

export const SettingsPage: React.FC = () => {
  const { activeOrg, refreshOrganizations } = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [orgName, setOrgName] = useState(activeOrg?.name || '');
  const [topK, setTopK] = useState(activeOrg?.settings?.topK ?? 4);
  const [temperature, setTemperature] = useState(activeOrg?.settings?.temperature ?? 0.2);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Invite modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchOrgDetails = async () => {
    try {
      const data = await api.getCurrentOrganization();
      setMembers((data.members as OrganizationMember[]) || []);
      setOrgName(data.name);
      if (data.settings) {
        if (data.settings.topK !== undefined) setTopK(data.settings.topK);
        if (data.settings.temperature !== undefined) setTemperature(data.settings.temperature);
      }
    } catch (err) {
      console.error('Failed to load org details:', err);
    }
  };

  useEffect(() => {
    fetchOrgDetails();
  }, [activeOrg]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await api.updateOrgSettings({
        name: orgName,
        topK: Number(topK),
        temperature: Number(temperature),
      });
      await refreshOrganizations();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);

    try {
      await api.inviteMember({ email: inviteEmail, role: inviteRole });
      setIsInviteModalOpen(false);
      setInviteEmail('');
      await fetchOrgDetails();
    } catch (err) {
      setInviteError((err as Error).message);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Remove member "${name}" from this workspace?`)) return;

    try {
      await api.removeMember(userId);
      await fetchOrgDetails();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          Workspace Settings & Multi-Tenancy
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Manage workspace settings, RAG retrieval tuning, and team permissions.
        </p>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* General & RAG Parameters */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white border-b border-slate-800/80 pb-3">
            <Sliders className="w-4 h-4 text-indigo-400" />
            General & Retrieval Settings
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Workspace Name
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Workspace Slug (Tenant Identifier)
              </label>
              <input
                type="text"
                value={activeOrg?.slug || ''}
                disabled
                className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-500 font-mono cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Top-K Retrieved Chunks: <span className="text-indigo-400 font-mono">{topK}</span>
                </label>
                <span className="text-[11px] text-slate-400">Default: 4</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Number of most relevant vector chunks injected into the prompt.
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Model Temperature: <span className="text-indigo-400 font-mono">{temperature}</span>
                </label>
                <span className="text-[11px] text-slate-400">Strict: 0.1 - 0.2</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Lower values guarantee deterministic, fact-grounded responses.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {saveSuccess ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <Check className="w-4 h-4" /> Settings saved successfully!
              </span>
            ) : (
              <span></span>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-md shadow-indigo-600/20"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Workspace Settings'}
            </button>
          </div>
        </div>
      </form>

      {/* Team Management */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Users className="w-4 h-4 text-indigo-400" />
            Workspace Members & Roles
          </div>

          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
            Add Member
          </button>
        </div>

        <div className="divide-y divide-slate-800/60">
          {members.map((member) => (
            <div key={member.id} className="py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-indigo-300">
                  {member.user.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-200">{member.user.name}</p>
                  <p className="text-[11px] text-slate-400">{member.user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-mono font-medium bg-slate-800 border border-slate-700 text-indigo-300">
                  {member.role}
                </span>

                {member.role !== 'OWNER' && (
                  <button
                    onClick={() => handleRemoveMember(member.user.id, member.user.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                    title="Remove member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tenant Security Audit Guarantee */}
      <div className="p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-slate-300">
          <p className="font-semibold text-white">Multi-Tenant Isolation Safeguards Active</p>
          <p className="mt-1 text-slate-400">
            Every database query and vector similarity calculation is hard-scoped to organization ID{' '}
            <code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300 font-mono text-[11px]">
              {activeOrg?.id}
            </code>
            . Cross-tenant token replay, document ID guessing, and query injection are strictly blocked.
          </p>
        </div>
      </div>

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-1">Add Workspace Member</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter the registered email of the user you want to add to this workspace.
            </p>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">User Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="MEMBER">Member (Upload docs & chat)</option>
                  <option value="ADMIN">Admin (Manage settings & docs)</option>
                  <option value="VIEWER">Viewer (Read-only chat)</option>
                </select>
              </div>

              {inviteError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  {inviteError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                >
                  Add to Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
