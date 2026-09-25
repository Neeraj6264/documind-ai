import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logger } from '../utils/logger.js';

const createOrgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

const updateSettingsSchema = z.object({
  name: z.string().min(2).optional(),
  topK: z.number().int().min(1).max(10).optional(),
  temperature: z.number().min(0).max(1).optional(),
});

export class TenantController {
  public static async listOrganizations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const memberships = await prisma.organizationMember.findMany({
        where: { userId: req.user!.id },
        include: {
          organization: {
            include: {
              _count: {
                select: {
                  documents: true,
                  members: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      res.status(200).json({
        success: true,
        data: memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          plan: m.organization.plan,
          role: m.role,
          documentsCount: m.organization._count.documents,
          membersCount: m.organization._count.members,
          createdAt: m.organization.createdAt,
        })),
      });
    } catch (error) {
      logger.error('List organizations error:', error);
      res.status(500).json({ success: false, error: 'Failed to list organizations' });
    }
  }

  public static async createOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { name } = createOrgSchema.parse(req.body);
      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);
      const slug = `${baseSlug}-${Date.now().toString(36)}`;

      const org = await prisma.$transaction(async (tx) => {
        const newOrg = await tx.organization.create({
          data: {
            name,
            slug,
            ownerId: req.user!.id,
          },
        });

        await tx.organizationMember.create({
          data: {
            organizationId: newOrg.id,
            userId: req.user!.id,
            role: 'OWNER',
          },
        });

        return newOrg;
      });

      res.status(201).json({
        success: true,
        data: org,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors[0].message });
        return;
      }
      logger.error('Create organization error:', error);
      res.status(500).json({ success: false, error: 'Failed to create organization' });
    }
  }

  public static async getCurrentOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true },
              },
            },
          },
          _count: {
            select: {
              documents: true,
              conversations: true,
              members: true,
            },
          },
        },
      });

      if (!org) {
        res.status(404).json({ success: false, error: 'Organization not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          ...org,
          currentUserRole: req.tenant!.role,
        },
      });
    } catch (error) {
      logger.error('Get current org error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch organization' });
    }
  }

  public static async updateSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;
      const validated = updateSettingsSchema.parse(req.body);

      const existingSettings = (req.tenant!.organization.settings as Record<string, unknown>) || {};
      const updatedSettings = {
        ...existingSettings,
        ...(validated.topK !== undefined && { topK: validated.topK }),
        ...(validated.temperature !== undefined && { temperature: validated.temperature }),
      };

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(validated.name && { name: validated.name }),
          settings: updatedSettings,
        },
      });

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors[0].message });
        return;
      }
      logger.error('Update org settings error:', error);
      res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
  }

  public static async inviteMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;
      const { email, role } = inviteMemberSchema.parse(req.body);

      const targetUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!targetUser) {
        res.status(404).json({
          success: false,
          error: 'No user registered with this email address yet. Please ask them to sign up first.',
        });
        return;
      }

      const existingMember = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: targetUser.id,
          },
        },
      });

      if (existingMember) {
        res.status(409).json({ success: false, error: 'User is already a member of this workspace' });
        return;
      }

      const newMembership = await prisma.organizationMember.create({
        data: {
          organizationId: orgId,
          userId: targetUser.id,
          role,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      res.status(201).json({
        success: true,
        data: newMembership,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors[0].message });
        return;
      }
      logger.error('Invite member error:', error);
      res.status(500).json({ success: false, error: 'Failed to invite member' });
    }
  }

  public static async removeMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.tenant!.organization.id;
      const { userId } = req.params;

      if (userId === req.tenant!.organization.ownerId) {
        res.status(400).json({ success: false, error: 'Cannot remove the workspace owner' });
        return;
      }

      await prisma.organizationMember.delete({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId,
          },
        },
      });

      res.status(200).json({ success: true, message: 'Member removed from workspace' });
    } catch (error) {
      logger.error('Remove member error:', error);
      res.status(500).json({ success: false, error: 'Failed to remove member' });
    }
  }
}
