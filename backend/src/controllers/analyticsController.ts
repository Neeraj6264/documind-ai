import { Response } from 'express';
import { prisma } from '../db/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class AnalyticsController {
  public static async getTenantMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;

      // Aggregations strictly filtered by organizationId
      const [
        docCount,
        readyDocCount,
        failedDocCount,
        chunkCount,
        totalStorageBytes,
        conversationCount,
        totalQuestionsAsked,
      ] = await Promise.all([
        prisma.document.count({ where: { organizationId: orgId } }),
        prisma.document.count({ where: { organizationId: orgId, status: 'READY' } }),
        prisma.document.count({ where: { organizationId: orgId, status: 'FAILED' } }),
        prisma.documentChunk.count({ where: { organizationId: orgId } }),
        prisma.document.aggregate({
          where: { organizationId: orgId },
          _sum: { fileSize: true },
        }),
        prisma.conversation.count({ where: { organizationId: orgId } }),
        prisma.message.count({
          where: {
            conversation: { organizationId: orgId },
            role: 'USER',
          },
        }),
      ]);

      // Recent activity (documents uploaded and chats created)
      const recentDocs = await prisma.document.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          fileName: true,
          fileSize: true,
          fileType: true,
          status: true,
          createdAt: true,
        },
      });

      const recentConversations = await prisma.conversation.findMany({
        where: { organizationId: orgId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      });

      res.status(200).json({
        success: true,
        data: {
          metrics: {
            totalDocuments: docCount,
            readyDocuments: readyDocCount,
            failedDocuments: failedDocCount,
            totalChunks: chunkCount,
            storageBytes: totalStorageBytes._sum.fileSize || 0,
            storageFormatted: formatBytes(totalStorageBytes._sum.fileSize || 0),
            totalConversations: conversationCount,
            totalQuestionsAsked,
          },
          recentActivity: {
            documents: recentDocs,
            conversations: recentConversations,
          },
        },
      });
    } catch (error) {
      logger.error('Analytics metrics error:', error);
      res.status(500).json({ success: false, error: 'Failed to retrieve tenant metrics' });
    }
  }
}

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
