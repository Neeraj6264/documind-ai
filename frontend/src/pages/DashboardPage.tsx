import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Layers,
  MessageSquare,
  HelpCircle,
  HardDrive,
  Upload,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api.js';
import { TenantMetrics, DocumentItem, Conversation } from '../types/index.js';
import { useAuth } from '../contexts/AuthContext.js';

export const DashboardPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const [metrics, setMetrics] = useState<TenantMetrics | null>(null);
  const [recentDocs, setRecentDocs] = useState<DocumentItem[]>([]);
  const [recentChats, setRecentChats] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const data = await api.getAnalyticsMetrics();
        setMetrics(data.metrics);
        setRecentDocs(data.recentActivity.documents);
        setRecentChats(data.recentActivity.conversations);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [activeOrg]);

  const statCards = [
    {
      title: 'Total Documents',
      value: metrics?.totalDocuments ?? 0,
      sub: `${metrics?.readyDocuments ?? 0} ready for RAG`,
      icon: FileText,
      gradient: 'from-blue-600 to-indigo-600',
    },
    {
      title: 'Vector Chunks',
      value: metrics?.totalChunks ?? 0,
      sub: 'Indexed in pgvector',
      icon: Layers,
      gradient: 'from-indigo-600 to-violet-600',
    },
    {
      title: 'AI Questions Asked',
      value: metrics?.totalQuestionsAsked ?? 0,
      sub: `${metrics?.totalConversations ?? 0} conversations`,
      icon: HelpCircle,
      gradient: 'from-violet-600 to-purple-600',
    },
    {
      title: 'Storage Used',
      value: metrics?.storageFormatted ?? '0 Bytes',
      sub: 'Partition-isolated storage',
      icon: HardDrive,
      gradient: 'from-purple-600 to-pink-600',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-7 border border-slate-800">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Enterprise Multi-Tenant Isolation Enforced
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Welcome to {activeOrg?.name || 'DocuMind Workspace'}
          </h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            Upload your private PDF, DOCX, and TXT documentation. Our pgvector retrieval pipeline will parse, chunk, and embed your documents for grounded, hallucination-free AI answers.
          </p>

          <div className="flex flex-wrap gap-3 mt-5">
            <Link
              to="/documents"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-lg shadow-indigo-600/25"
            >
              <Upload className="w-4 h-4" />
              Upload Documents
            </Link>
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              Open AI Chat
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Subtle decorative glow */}
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all backdrop-blur-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{stat.title}</span>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${stat.gradient} flex items-center justify-center text-white shadow-md`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold tracking-tight text-white">{stat.value}</span>
                <p className="text-[11px] text-slate-400 mt-1">{stat.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two-Column Activity Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Recent Documents</h3>
              <p className="text-xs text-slate-400">Knowledge base files in this tenant</p>
            </div>
            <Link to="/documents" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
              View all
            </Link>
          </div>

          <div className="flex-1 divide-y divide-slate-800/60">
            {recentDocs.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No documents uploaded yet. Start by uploading a PDF or DOCX file!
              </div>
            ) : (
              recentDocs.map((doc) => (
                <div key={doc.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-medium text-slate-200 truncate">{doc.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(doc.createdAt).toLocaleDateString()} • {(doc.fileSize / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>

                  <div>
                    {doc.status === 'READY' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Ready
                      </span>
                    )}
                    {doc.status === 'PROCESSING' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Clock className="w-3 h-3 animate-spin" /> Processing
                      </span>
                    )}
                    {doc.status === 'FAILED' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <AlertTriangle className="w-3 h-3" /> Failed
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Conversations */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Recent AI Conversations</h3>
              <p className="text-xs text-slate-400">RAG query sessions</p>
            </div>
            <Link to="/chat" className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
              Open chat
            </Link>
          </div>

          <div className="flex-1 divide-y divide-slate-800/60">
            {recentChats.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                No conversations yet. Ask your first question in AI Chat!
              </div>
            ) : (
              recentChats.map((chat) => (
                <Link
                  key={chat.id}
                  to={`/chat?c=${chat.id}`}
                  className="py-3 flex items-center justify-between group hover:bg-slate-800/30 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-medium text-slate-200 group-hover:text-indigo-300 truncate">
                        {chat.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {chat._count?.messages || 0} messages • {new Date(chat.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
