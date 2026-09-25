import React, { useEffect, useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  X,
  FileCheck,
  Search,
} from 'lucide-react';
import { api } from '../services/api.js';
import { DocumentItem, DocumentChunk } from '../types/index.js';
import { useAuth } from '../contexts/AuthContext.js';

export const DocumentsPage: React.FC = () => {
  const { activeOrg } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Chunk inspection modal state
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchDocs = async () => {
    try {
      const data = await api.listDocuments();
      setDocuments(data);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [activeOrg]);

  // Polling for processing documents
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'PROCESSING');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchDocs();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents]);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      await api.uploadDocument(file);
      await fetchDocs();
    } catch (err) {
      setUploadError((err as Error).message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${title}"? This will purge all associated embeddings from pgvector.`)) {
      return;
    }

    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleInspectChunks = async (doc: DocumentItem) => {
    setSelectedDoc(doc);
    setIsLoadingChunks(true);
    try {
      const result = await api.getDocumentChunks(doc.id);
      setChunks(result);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const filteredDocs = documents.filter(
    (d) =>
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            Knowledge Base Documents
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Uploaded files are parsed, chunked, and stored in pgvector with strict tenant separation.
          </p>
        </div>

        <button
          onClick={fetchDocs}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="relative border-2 border-dashed border-slate-700/80 hover:border-indigo-500/80 rounded-2xl p-7 text-center bg-slate-900/30 hover:bg-slate-900/60 transition-all cursor-pointer group"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.docx,.doc,.txt,.md"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="max-w-md mx-auto flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 group-hover:bg-indigo-600/20 text-indigo-400 flex items-center justify-center mb-3 transition-colors">
            {isUploading ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>

          <p className="text-sm font-semibold text-slate-200">
            {isUploading ? 'Uploading and parsing document...' : 'Click to upload or drag & drop files here'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Supported formats: <span className="text-slate-300 font-medium">PDF, DOCX, TXT</span> (Max 25MB)
          </p>
        </div>

        {uploadError && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {uploadError}
          </div>
        )}
      </div>

      {/* Search and Table */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden backdrop-blur-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by title or filename..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="text-xs text-slate-400">
            Total: <span className="font-semibold text-slate-200">{filteredDocs.length}</span> documents
          </div>
        </div>

        {/* Table Content */}
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-400 mt-2">Loading documents...</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            No documents found matching your filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Document Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Pages / Chunks</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">{doc.title}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{doc.fileName}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      {doc.status === 'READY' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ready for RAG
                        </span>
                      )}
                      {doc.status === 'PROCESSING' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                          Processing Chunks...
                        </span>
                      )}
                      {doc.status === 'FAILED' && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          title={doc.errorMessage || 'Unknown error'}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Failed
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-slate-300">
                      <span className="font-semibold text-white">{doc.chunkCount}</span> chunks
                      <span className="text-slate-500 ml-1">({doc.pageCount || 1} pgs)</span>
                    </td>

                    <td className="px-4 py-3.5 text-slate-400">
                      {(doc.fileSize / 1024).toFixed(1)} KB
                    </td>

                    <td className="px-4 py-3.5 text-slate-400">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleInspectChunks(doc)}
                          title="Inspect Extracted Chunks"
                          className="p-1.5 text-slate-400 hover:text-indigo-300 rounded hover:bg-slate-800 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.title)}
                          title="Delete Document & Chunks"
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chunk Inspector Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Chunk Inspector: {selectedDoc.title}</h3>
                  <p className="text-[11px] text-slate-400">
                    Tenant-isolated vectors stored in PostgreSQL pgvector
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDoc(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {isLoadingChunks ? (
                <div className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs text-slate-400 mt-2">Loading pgvector chunks...</p>
                </div>
              ) : chunks.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No chunks generated for this document.
                </div>
              ) : (
                chunks.map((chunk) => (
                  <div key={chunk.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800/80 pb-1.5">
                      <span className="font-semibold text-indigo-400">Chunk #{chunk.chunkIndex + 1}</span>
                      <div className="flex gap-3">
                        <span>Page {chunk.pageNumber || 'N/A'}</span>
                        <span>~{chunk.tokenCount} tokens</span>
                      </div>
                    </div>
                    <p className="text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                      {chunk.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
