import { prisma } from '../db/prisma.js';
import { QuerySearchResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface ChunkToStore {
  organizationId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber?: number | null;
  embedding: number[];
}

export class VectorService {
  /**
   * Save chunks with pgvector embeddings
   */
  public static async saveChunks(chunks: ChunkToStore[]): Promise<void> {
    if (chunks.length === 0) return;

    logger.info(`Storing ${chunks.length} chunks with embeddings for document ${chunks[0].documentId}`);

    // Batch insert chunks with raw vector cast
    for (const chunk of chunks) {
      const vectorStr = `[${chunk.embedding.join(',')}]`;
      const pageNum = chunk.pageNumber ?? null;

      await prisma.$executeRaw`
        INSERT INTO document_chunks (
          "id",
          "organizationId",
          "documentId",
          "chunkIndex",
          "content",
          "tokenCount",
          "pageNumber",
          "embedding",
          "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          ${chunk.organizationId},
          ${chunk.documentId},
          ${chunk.chunkIndex},
          ${chunk.content},
          ${chunk.tokenCount},
          ${pageNum},
          ${vectorStr}::vector,
          NOW()
        );
      `;
    }
  }

  /**
   * Perform vector similarity search STRICTLY isolated to the tenant (organizationId).
   * Cosine distance in pgvector is <=> (0 = identical, 2 = opposite).
   * Similarity is 1 - distance.
   */
  public static async searchSimilarChunks(
    organizationId: string,
    queryEmbedding: number[],
    topK: number = 4,
    minSimilarity: number = 0.3
  ): Promise<QuerySearchResult[]> {
    if (!organizationId) {
      throw new Error('Tenant isolation violation: organizationId is required for vector search');
    }

    const vectorStr = `[${queryEmbedding.join(',')}]`;

    // Strictly enforce organizationId filter at SQL level
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        documentId: string;
        documentTitle: string;
        chunkIndex: number;
        content: string;
        pageNumber: number | null;
        similarity: number;
      }>
    >`
      SELECT 
        c."id",
        c."documentId",
        d."title" AS "documentTitle",
        c."chunkIndex",
        c."content",
        c."pageNumber",
        (1 - (c."embedding" <=> ${vectorStr}::vector)) AS "similarity"
      FROM document_chunks c
      INNER JOIN documents d ON c."documentId" = d."id"
      WHERE c."organizationId" = ${organizationId}
        AND d."status" = 'READY'
        AND c."embedding" IS NOT NULL
      ORDER BY c."embedding" <=> ${vectorStr}::vector ASC
      LIMIT ${topK};
    `;

    // Filter by minSimilarity threshold if specified
    return results.filter((r) => r.similarity >= minSimilarity);
  }
}
