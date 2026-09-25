import {
  User,
  Organization,
  DocumentItem,
  DocumentChunk,
  Conversation,
  TenantMetrics,
  Citation,
} from '../types/index.js';

const API_BASE = '/api/v1';

class ApiClient {
  private getHeaders(isFormData = false): HeadersInit {
    const headers: Record<string, string> = {};

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const token = localStorage.getItem('documind_access_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const activeOrgId = localStorage.getItem('documind_active_org_id');
    if (activeOrgId) {
      headers['x-organization-id'] = activeOrgId;
    }

    return headers;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const isFormData = options.body instanceof FormData;
    const headers = {
      ...this.getHeaders(isFormData),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      // Attempt token refresh
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        // Retry original request with new token
        const retryHeaders = {
          ...this.getHeaders(isFormData),
          ...options.headers,
        };
        const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers: retryHeaders,
        });
        const retryData = await retryResponse.json();
        if (!retryResponse.ok) {
          throw new Error(retryData.error || 'Request failed');
        }
        return retryData.data !== undefined ? retryData.data : retryData;
      } else {
        localStorage.removeItem('documind_access_token');
        localStorage.removeItem('documind_refresh_token');
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data.data !== undefined ? data.data : data;
  }

  private async tryRefreshToken(): Promise<boolean> {
    const refreshToken = localStorage.getItem('documind_refresh_token');
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;
      const data = await response.json();
      if (data.data?.accessToken) {
        localStorage.setItem('documind_access_token', data.data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Auth API
  public async signup(payload: { email: string; password: string; name: string; organizationName?: string }) {
    return this.request<{
      user: User;
      organization: Organization;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async login(payload: { email: string; password: string }) {
    return this.request<{
      user: User;
      organizations: Organization[];
      activeOrganization: Organization | null;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async getMe() {
    return this.request<{ user: User; organizations: Organization[] }>('/auth/me');
  }

  public async logout() {
    const refreshToken = localStorage.getItem('documind_refresh_token');
    try {
      await this.request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } finally {
      localStorage.removeItem('documind_access_token');
      localStorage.removeItem('documind_refresh_token');
      localStorage.removeItem('documind_active_org_id');
    }
  }

  // Organizations API
  public async listOrganizations() {
    return this.request<Organization[]>('/organizations');
  }

  public async createOrganization(payload: { name: string }) {
    return this.request<Organization>('/organizations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async getCurrentOrganization() {
    return this.request<Organization & { members: unknown[]; currentUserRole: string }>('/organizations/current');
  }

  public async updateOrgSettings(payload: { name?: string; topK?: number; temperature?: number }) {
    return this.request<Organization>('/organizations/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public async inviteMember(payload: { email: string; role: string }) {
    return this.request('/organizations/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async removeMember(userId: string) {
    return this.request(`/organizations/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // Documents API
  public async uploadDocument(file: File, title?: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);

    return this.request<DocumentItem>('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  }

  public async listDocuments() {
    return this.request<DocumentItem[]>('/documents');
  }

  public async getDocument(id: string) {
    return this.request<DocumentItem>(`/documents/${id}`);
  }

  public async getDocumentChunks(id: string) {
    return this.request<DocumentChunk[]>(`/documents/${id}/chunks`);
  }

  public async deleteDocument(id: string) {
    return this.request(`/documents/${id}`, {
      method: 'DELETE',
    });
  }

  // Chat API
  public async listConversations() {
    return this.request<Conversation[]>('/chat/conversations');
  }

  public async getConversation(id: string) {
    return this.request<Conversation>(`/chat/conversations/${id}`);
  }

  public async deleteConversation(id: string) {
    return this.request(`/chat/conversations/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * Stream chat with Server-Sent Events (SSE)
   */
  public async streamChat({
    question,
    conversationId,
    onMeta,
    onToken,
    onDone,
    onError,
  }: {
    question: string;
    conversationId?: string;
    onMeta: (meta: { conversationId: string; userMessageId: string; citations: Citation[] }) => void;
    onToken: (token: string) => void;
    onDone: (data: { assistantMessageId: string }) => void;
    onError: (err: string) => void;
  }): Promise<void> {
    const headers = this.getHeaders() as Record<string, string>;

    try {
      const response = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question, conversationId, stream: true }),
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `HTTP ${response.status}: Failed to stream response`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported on this browser');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.replace('data: ', '');
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.type === 'meta') {
                onMeta({
                  conversationId: parsed.conversationId,
                  userMessageId: parsed.userMessageId,
                  citations: parsed.citations,
                });
              } else if (parsed.type === 'token') {
                onToken(parsed.content);
              } else if (parsed.type === 'done') {
                onDone({ assistantMessageId: parsed.assistantMessageId });
              } else if (parsed.type === 'error') {
                onError(parsed.error);
              }
            } catch {
              // Ignore partial parse
            }
          }
        }
      }
    } catch (error) {
      onError((error as Error).message);
    }
  }

  // Analytics API
  public async getAnalyticsMetrics() {
    return this.request<{
      metrics: TenantMetrics;
      recentActivity: {
        documents: DocumentItem[];
        conversations: Conversation[];
      };
    }>('/analytics/metrics');
  }
}

export const api = new ApiClient();
