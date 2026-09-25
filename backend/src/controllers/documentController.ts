import { Response } from 'express';
import fs from 'fs';
import { prisma } from '../db/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { ParsingService } from '../services/parsingService.js';
import { ChunkingService } from '../services/chunkingService.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { VectorService } from '../services/vectorService.js';
import { logger } from '../utils/logger.js';

export class DocumentController {
  public static async uploadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const orgId = req.tenant!.organization.id;
      const userId = req.user!.id;
      const file = req.file;

      const title = req.body.title || file.originalname;

      // 1. Create document record with PROCESSING status
      const document = await prisma.document.create({
        data: {
          organizationId: orgId,
          uploadedById: userId,
          title,
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          filePath: file.path,
          status: 'PROCESSING',
        },
      });

      // 2. Return response immediately (asynchronous processing in background)
      res.status(202).json({
        success: true,
        message: 'Document uploaded and processing started',
        data: document,
      });

      // 3. Process document in background
      (async () => {
        try {
          logger.info(`Starting background extraction for doc ${document.id} (${document.fileName})`);
          
          // Parse file
          const parsed = await ParsingService.parseFile(file.path, file.mimetype, file.originalname);

          if (!parsed.text || parsed.text.trim().length === 0) {
            throw new Error('Extracted text is empty. Document may be scanned image or corrupted.');
          }

          // Chunk text
          const rawChunks = ChunkingService.chunkText(parsed.text, {
            chunkSize: 850,
            chunkOverlap: 150,
            totalPages: parsed.pageCount,
          });

          if (rawChunks.length === 0) {
            throw new Error('No valid chunks generated from document text');
          }

          logger.info(`Generated ${rawChunks.length} chunks. Creating embeddings...`);

          // Generate embeddings
          const chunkTexts = rawChunks.map((c) => c.content);
          const embeddings = await EmbeddingService.generateBatchEmbeddings(chunkTexts);

          // Store chunks and vectors strictly under this organization
          const chunksToStore = rawChunks.map((chunk, i) => ({
            organizationId: orgId,
            documentId: document.id,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            pageNumber: chunk.pageNumber ?? 1,
            embedding: embeddings[i],
          }));

          await VectorService.saveChunks(chunksToStore);

          const totalTokens = rawChunks.reduce((acc, c) => acc + c.tokenCount, 0);

          // Mark document READY
          await prisma.document.update({
            where: { id: document.id },
            data: {
              status: 'READY',
              chunkCount: rawChunks.length,
              tokenCount: totalTokens,
              pageCount: parsed.pageCount,
            },
          });

          logger.info(`Successfully processed document ${document.id} (${rawChunks.length} chunks)`);
        } catch (procError) {
          logger.error(`Error processing document ${document.id}:`, procError);
          await prisma.document.update({
            where: { id: document.id },
            data: {
              status: 'FAILED',
              errorMessage: (procError as Error).message || 'Failed to process document',
            },
          });
        }
      })();
    } catch (error) {
      logger.error('Document upload error:', error);
      res.status(500).json({ success: false, error: 'Document upload failed' });
    }
  }

  public static async listDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;

      // Mandatory tenant filter
      const documents = await prisma.document.findMany({
        where: { organizationId: orgId },
        include: {
          uploadedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: documents,
      });
    } catch (error) {
      logger.error('List documents error:', error);
      res.status(500).json({ success: false, error: 'Failed to list documents' });
    }
  }

  public static async getDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;
      const { id } = req.params;

      // Mandatory check: id AND organizationId
      const document = await prisma.document.findFirst({
        where: {
          id,
          organizationId: orgId, // Prevents cross-tenant discovery!
        },
        include: {
          uploadedBy: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { chunks: true },
          },
        },
      });

      if (!document) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: document,
      });
    } catch (error) {
      logger.error('Get document error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch document' });
    }
  }

  public static async getDocumentChunks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;
      const { id } = req.params;

      // Tenant check
      const doc = await prisma.document.findFirst({
        where: { id, organizationId: orgId },
      });

      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      const chunks = await prisma.documentChunk.findMany({
        where: {
          documentId: id,
          organizationId: orgId,
        },
        select: {
          id: true,
          chunkIndex: true,
          content: true,
          tokenCount: true,
          pageNumber: true,
          createdAt: true,
        },
        orderBy: { chunkIndex: 'asc' },
        take: 100,
      });

      res.status(200).json({
        success: true,
        data: chunks,
      });
    } catch (error) {
      logger.error('Get document chunks error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch document chunks' });
    }
  }

  public static async deleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;
      const { id } = req.params;

      // Security: Only delete if belongs to this tenant
      const doc = await prisma.document.findFirst({
        where: { id, organizationId: orgId },
      });

      if (!doc) {
        res.status(404).json({ success: false, error: 'Document not found' });
        return;
      }

      // Delete file from disk if exists
      if (fs.existsSync(doc.filePath)) {
        try {
          fs.unlinkSync(doc.filePath);
        } catch (e) {
          logger.warn(`Could not delete file at ${doc.filePath}`, e);
        }
      }

      // Delete database record (cascades to chunks)
      await prisma.document.delete({
        where: { id: doc.id },
      });

      res.status(200).json({
        success: true,
        message: 'Document and all associated embeddings deleted successfully',
      });
    } catch (error) {
      logger.error('Delete document error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete document' });
    }
  }
}
