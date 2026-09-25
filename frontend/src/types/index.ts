export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role?: Role;
  documentsCount?: number;
  membersCount?: number;
  settings?: {
    topK?: number;
    temperature?: number;
    maxUploadSizeMb?: number;
  };
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  organizationId: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: DocumentStatus;
  errorMessage?: string | null;
  pageCount?: number;
  chunkCount: number;
  tokenCount: number;
  createdAt: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface DocumentChunk {
  id: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber?: number | null;
  createdAt: string;
}

export interface Citation {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  similarity: number;
}

export interface MessageCitation {
  id: string;
  chunkId: string;
  similarity?: number | null;
  snippet: string;
  chunk: {
    id: string;
    pageNumber: number | null;
    chunkIndex: number;
    document: {
      id: string;
      title: string;
      fileName: string;
    };
  };
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: string;
  citations?: MessageCitation[];
}

export interface Conversation {
  id: string;
  organizationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    messages: number;
  };
  messages?: Message[];
}

export interface TenantMetrics {
  totalDocuments: number;
  readyDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  storageBytes: number;
  storageFormatted: string;
  totalConversations: number;
  totalQuestionsAsked: number;
}
