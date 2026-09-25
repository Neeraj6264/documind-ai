import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { RagService } from '../services/ragService.js';
import { logger } from '../utils/logger.js';

const messageSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  conversationId: z.string().uuid().optional(),
  stream: z.boolean().optional().default(false),
});

export class ChatController {
  public static async sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { question, conversationId, stream } = messageSchema.parse(req.body);
      const orgId = req.tenant!.organization.id;
      const userId = req.user!.id;

      const tenantSettings = (req.tenant!.organization.settings as Record<string, unknown>) || {};
      const topK = (tenantSettings.topK as number) || 4;

      if (stream) {
        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        await RagService.streamQuery({
          organizationId: orgId,
          userId,
          conversationId,
          question,
          res,
          topK,
        });
      } else {
        const result = await RagService.query({
          organizationId: orgId,
          userId,
          conversationId,
          question,
          topK,
        });

        res.status(200).json({
          success: true,
          data: result,
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors[0].message });
        return;
      }
      logger.error('Chat error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: (error as Error).message || 'Failed to process chat query',
        });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: (error as Error).message })}\n\n`);
        res.end();
      }
    }
  }

  public static async listConversations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;

      // Scoped strictly to current tenant
      const conversations = await prisma.conversation.findMany({
        where: { organizationId: orgId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: conversations,
      });
    } catch (error) {
      logger.error('List conversations error:', error);
      res.status(500).json({ success: false, error: 'Failed to list conversations' });
    }
  }

  public static async getConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;
      const { id } = req.params;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id,
          organizationId: orgId, // Mandatory tenant filter
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: {
              citations: {
                include: {
                  chunk: {
                    select: {
                      id: true,
                      pageNumber: true,
                      chunkIndex: true,
                      document: {
                        select: { id: true, title: true, fileName: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      logger.error('Get conversation error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch conversation' });
    }
  }

  public static async deleteConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;
      const { id } = req.params;

      const conv = await prisma.conversation.findFirst({
        where: { id, organizationId: orgId },
      });

      if (!conv) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

      await prisma.conversation.delete({
        where: { id: conv.id },
      });

      res.status(200).json({ success: true, message: 'Conversation deleted successfully' });
    } catch (error) {
      logger.error('Delete conversation error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete conversation' });
    }
  }
}
