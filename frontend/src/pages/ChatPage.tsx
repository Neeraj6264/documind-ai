import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Plus,
  Trash2,
  Sparkles,
  User as UserIcon,
  Bot,
  ExternalLink,
  ShieldAlert,
  X,
  MessageSquare,
  BookOpen,
} from 'lucide-react';
import { api } from '../services/api.js';
import { Conversation, Message, Citation } from '../types/index.js';
import { useAuth } from '../contexts/AuthContext.js';

export const ChatPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(searchParams.get('c') || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([]);

  // Citation inspector modal
  const [inspectCitation, setInspectCitation] = useState<Citation | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load conversations list
  const loadConversations = async () => {
    try {
      const data = await api.listConversations();
      setConversations(data);
      if (!activeConvId && data.length > 0) {
        setActiveConvId(data[0].id);
        setSearchParams({ c: data[0].id });
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [activeOrg]);

  // Load active conversation messages
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const conv = await api.getConversation(activeConvId);
        if (conv.messages) {
          setMessages(conv.messages);
        }
      } catch (err) {
        console.error('Failed to load messages for conv:', err);
      }
    };

    loadMessages();
  }, [activeConvId]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleStartNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setStreamingContent('');
    setCurrentCitations([]);
    setSearchParams({});
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        handleStartNewChat();
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputQuery.trim();
    if (!query || isStreaming) return;

    setInputQuery('');
    setIsStreaming(true);
    setStreamingContent('');
    setCurrentCitations([]);

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConvId || '',
      role: 'USER',
      content: query,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    let generatedText = '';
    let citationsCollected: Citation[] = [];
    let assignedConvId = activeConvId;

    await api.streamChat({
      question: query,
      conversationId: activeConvId || undefined,
      onMeta: (meta) => {
        assignedConvId = meta.conversationId;
        setActiveConvId(meta.conversationId);
        setSearchParams({ c: meta.conversationId });
        citationsCollected = meta.citations || [];
        setCurrentCitations(meta.citations || []);
      },
      onToken: (token) => {
        generatedText += token;
        setStreamingContent(generatedText);
      },
      onDone: (data) => {
        setIsStreaming(false);
        const finalAssistantMsg: Message = {
          id: data.assistantMessageId,
          conversationId: assignedConvId || '',
          role: 'ASSISTANT',
          content: generatedText,
          createdAt: new Date().toISOString(),
          citations: citationsCollected.map((c) => ({
            id: c.id,
            chunkId: c.id,
            similarity: c.similarity,
            snippet: c.content,
            chunk: {
              id: c.id,
              pageNumber: c.pageNumber,
              chunkIndex: c.chunkIndex,
              document: {
                id: c.documentId,
                title: c.documentTitle,
                fileName: c.documentTitle,
              },
            },
          })),
        };

        setMessages((prev) => [...prev, finalAssistantMsg]);
        setStreamingContent('');
        setCurrentCitations([]);
        loadConversations();
      },
      onError: (err) => {
        setIsStreaming(false);
        alert(`Error: ${err}`);
      },
    });
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden backdrop-blur-sm max-w-7xl mx-auto">
      {/* Left Chat Threads Sidebar */}
      <div className="w-72 bg-slate-950/70 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-800">
          <button
            onClick={handleStartNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">No chat history</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => {
                  setActiveConvId(conv.id);
                  setSearchParams({ c: conv.id });
                }}
                className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-colors ${
                  activeConvId === conv.id
                    ? 'bg-indigo-500/15 text-indigo-300 font-medium border border-indigo-500/30'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 rounded transition-opacity"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col bg-slate-900/30 min-w-0">
        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && !isStreaming ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Ask your workspace documents</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                DocuMind strictly searches vectors partitioned under <span className="text-slate-200 font-semibold">{activeOrg?.name}</span>. It cites every source and never hallucinates.
              </p>

              <div className="grid grid-cols-1 gap-2 mt-6 w-full text-left">
                <button
                  onClick={() => setInputQuery('Summarize the key points across our uploaded documents')}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-indigo-500/50 text-xs text-slate-300 hover:text-white transition-colors"
                >
                  "Summarize the key points across our uploaded documents"
                </button>
                <button
                  onClick={() => setInputQuery('What are the main guidelines or steps outlined in the docs?')}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-indigo-500/50 text-xs text-slate-300 hover:text-white transition-colors"
                >
                  "What are the main guidelines or steps outlined in the docs?"
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3.5 ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'ASSISTANT' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shrink-0 shadow-md">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                      msg.role === 'USER'
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-600/20'
                        : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm'
                    }`}
                  >
                    <div className="prose prose-invert prose-xs max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>

                    {/* Citations badges for assistant message */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-slate-800/80">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-400 mb-2">
                          <BookOpen className="w-3.5 h-3.5" />
                          Source Citations ({msg.citations.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.citations.map((c, i) => (
                            <button
                              key={i}
                              onClick={() =>
                                setInspectCitation({
                                  id: c.chunkId,
                                  documentId: c.chunk.document.id,
                                  documentTitle: c.chunk.document.title,
                                  chunkIndex: c.chunk.chunkIndex,
                                  content: c.snippet,
                                  pageNumber: c.chunk.pageNumber,
                                  similarity: c.similarity || 0,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 transition-colors"
                            >
                              <span className="font-semibold text-indigo-400">#{i + 1}</span>
                              <span className="truncate max-w-[140px]">{c.chunk.document.title}</span>
                              {c.chunk.pageNumber && (
                                <span className="text-slate-500 font-mono">p.{c.chunk.pageNumber}</span>
                              )}
                              {c.similarity && (
                                <span className="text-emerald-400 font-mono">
                                  {Math.round(c.similarity * 100)}%
                                </span>
                              )}
                              <ExternalLink className="w-3 h-3 text-slate-500 ml-0.5" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {msg.role === 'USER' && (
                    <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming Output */}
              {isStreaming && (
                <div className="flex gap-3.5 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shrink-0 shadow-md animate-pulse">
                    <Bot className="w-4 h-4" />
                  </div>

                  <div className="max-w-2xl rounded-2xl p-4 text-xs leading-relaxed bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm">
                    {streamingContent ? (
                      <div className="prose prose-invert prose-xs max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-indigo-400">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                        Retrieving isolated chunks & generating response...
                      </div>
                    )}

                    {currentCitations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                          Retrieved {currentCitations.length} grounded chunk(s) from pgvector
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60">
          <form onSubmit={handleSendMessage} className="relative flex items-center">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask a question strictly based on your tenant's documents..."
              className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner"
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isStreaming}
              className="absolute right-2 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-[10px] text-slate-400 text-center mt-2 flex items-center justify-center gap-1.5">
            <ShieldAlert className="w-3 h-3 text-emerald-400" />
            Answers are restricted strictly to documents uploaded to this workspace.
          </p>
        </div>
      </div>

      {/* Citation Inspector Modal */}
      {inspectCitation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">Source Citation Details</h4>
                <p className="text-[11px] text-slate-400">
                  {inspectCitation.documentTitle} • Page {inspectCitation.pageNumber || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => setInspectCitation(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400">pgvector Cosine Similarity:</span>
                <span className="font-mono font-semibold text-emerald-400">
                  {(inspectCitation.similarity * 100).toFixed(1)}% match
                </span>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Retrieved Chunk Snippet:
                </label>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {inspectCitation.content}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
