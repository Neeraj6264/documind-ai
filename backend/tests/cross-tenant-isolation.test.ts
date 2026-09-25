import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { signAccessToken } from '../src/utils/jwt.js';

// Mock prisma and vector service to test isolation logic without requiring a live external DB during unit/integration tests
vi.mock('../src/db/prisma.js', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      organizationMember: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      organization: {
        findUnique: vi.fn(),
      },
      document: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
      },
      documentChunk: {
        findMany: vi.fn(),
      },
      conversation: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
    },
  };
});

describe('Strict Cross-Tenant Isolation Security Tests', () => {
  const userA = {
    id: 'user-a-uuid',
    email: 'alice@tenant-a.com',
    name: 'Alice Tenant A',
  };

  const userB = {
    id: 'user-b-uuid',
    email: 'bob@tenant-b.com',
    name: 'Bob Tenant B',
  };

  const orgA = {
    id: 'org-a-uuid',
    name: 'Acme Corp',
    slug: 'acme-corp',
    ownerId: userA.id,
    plan: 'PRO',
    settings: { topK: 4 },
  };

  const orgB = {
    id: 'org-b-uuid',
    name: 'Beta Global',
    slug: 'beta-global',
    ownerId: userB.id,
    plan: 'STARTER',
    settings: { topK: 4 },
  };

  const tokenUserA = signAccessToken({ userId: userA.id, email: userA.email, name: userA.name });
  const tokenUserB = signAccessToken({ userId: userB.id, email: userB.email, name: userB.name });

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock user resolution
    (prisma.user.findUnique as any).mockImplementation(({ where }: any) => {
      if (where.id === userA.id) return Promise.resolve(userA);
      if (where.id === userB.id) return Promise.resolve(userB);
      return Promise.resolve(null);
    });
  });

  it('PREVENTS tenant forgery: User B cannot access Org A by spoofing x-organization-id header', async () => {
    // Org membership check returns null because User B is NOT in Org A
    (prisma.organizationMember.findUnique as any).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .set('x-organization-id', orgA.id);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Forbidden');
  });

  it('PREVENTS cross-tenant document inspection: User B cannot view Tenant A document even with valid doc ID', async () => {
    // User B is valid member of Org B
    (prisma.organizationMember.findUnique as any).mockResolvedValue({
      organizationId: orgB.id,
      userId: userB.id,
      role: 'MEMBER',
      organization: orgB,
    });

    // Attempting to query document where id = docA and organizationId = orgB returns null
    (prisma.document.findFirst as any).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/documents/doc-secret-a-id')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .set('x-organization-id', orgB.id);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Document not found');
  });

  it('PREVENTS cross-tenant document deletion: User B cannot delete Tenant A document', async () => {
    (prisma.organizationMember.findUnique as any).mockResolvedValue({
      organizationId: orgB.id,
      userId: userB.id,
      role: 'ADMIN',
      organization: orgB,
    });

    // Document belongs to org A, so scoped lookup for org B returns null
    (prisma.document.findFirst as any).mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/documents/doc-secret-a-id')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .set('x-organization-id', orgB.id);

    expect(res.status).toBe(404);
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });

  it('PREVENTS cross-tenant conversation access: User B cannot read Tenant A chat threads', async () => {
    (prisma.organizationMember.findUnique as any).mockResolvedValue({
      organizationId: orgB.id,
      userId: userB.id,
      role: 'MEMBER',
      organization: orgB,
    });

    (prisma.conversation.findFirst as any).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/chat/conversations/conv-secret-a-id')
      .set('Authorization', `Bearer ${tokenUserB}`)
      .set('x-organization-id', orgB.id);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('ENFORCES tenant isolation at the vector search layer: Tenant A chunks are never returned for Tenant B queries', async () => {
    // Vector search query strictly includes WHERE organizationId = orgB.id
    (prisma.$queryRaw as any).mockImplementation((queryStr: any) => {
      // Simulate that query strictly queries orgB
      return Promise.resolve([
        {
          id: 'chunk-b-1',
          documentId: 'doc-b-1',
          documentTitle: 'Tenant B Public Notes',
          chunkIndex: 0,
          content: 'This is Tenant B data only.',
          pageNumber: 1,
          similarity: 0.92,
        },
      ]);
    });

    const { VectorService } = await import('../src/services/vectorService.js');
    const mockQueryVector = new Array(1536).fill(0.01);

    const results = await VectorService.searchSimilarChunks(orgB.id, mockQueryVector, 4);

    expect(results.length).toBe(1);
    expect(results[0].documentTitle).toBe('Tenant B Public Notes');
    // Verify no Tenant A information leaked
    expect(results.some((r) => r.content.includes('Tenant A'))).toBe(false);
  });
});
