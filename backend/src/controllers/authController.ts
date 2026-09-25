import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { AuthenticatedRequest } from '../types/index.js';
import { logger } from '../utils/logger.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  organizationName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export class AuthController {
  public static async signup(req: Request, res: Response): Promise<void> {
    try {
      const validated = signupSchema.parse(req.body);
      const existingUser = await prisma.user.findUnique({
        where: { email: validated.email.toLowerCase() },
      });

      if (existingUser) {
        res.status(409).json({ success: false, error: 'User with this email already exists' });
        return;
      }

      const passwordHash = await bcrypt.hash(validated.password, 10);
      const orgName = validated.organizationName || `${validated.name}'s Workspace`;
      const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);
      const orgSlug = `${baseSlug}-${Date.now().toString(36)}`;

      // Create user + initial organization in an atomic transaction
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: validated.email.toLowerCase(),
            passwordHash,
            name: validated.name,
          },
        });

        const org = await tx.organization.create({
          data: {
            name: orgName,
            slug: orgSlug,
            ownerId: user.id,
          },
        });

        const membership = await tx.organizationMember.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            role: 'OWNER',
          },
        });

        return { user, org, membership };
      });

      const tokenPayload = {
        userId: result.user.id,
        email: result.user.email,
        name: result.user.name,
      };

      const accessToken = signAccessToken(tokenPayload);
      const refreshToken = signRefreshToken(tokenPayload);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: result.user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
          },
          organization: {
            id: result.org.id,
            name: result.org.name,
            slug: result.org.slug,
            role: result.membership.role,
          },
          tokens: {
            accessToken,
            refreshToken,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors[0].message });
        return;
      }
      logger.error('Signup error:', error);
      res.status(500).json({ success: false, error: 'Internal server error during signup' });
    }
  }

  public static async login(req: Request, res: Response): Promise<void> {
    try {
      const validated = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email: validated.email.toLowerCase() },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user) {
        res.status(401).json({ success: false, error: 'Invalid email or password' });
        return;
      }

      const isValid = await bcrypt.compare(validated.password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ success: false, error: 'Invalid email or password' });
        return;
      }

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
      };

      const accessToken = signAccessToken(tokenPayload);
      const refreshToken = signRefreshToken(tokenPayload);

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const organizations = user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      }));

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          organizations,
          activeOrganization: organizations[0] || null,
          tokens: {
            accessToken,
            refreshToken,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, error: error.errors[0].message });
        return;
      }
      logger.error('Login error:', error);
      res.status(500).json({ success: false, error: 'Internal server error during login' });
    }
  }

  public static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ success: false, error: 'Refresh token is required' });
        return;
      }

      const decoded = verifyRefreshToken(refreshToken);
      const stored = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!stored || stored.expiresAt < new Date()) {
        res.status(401).json({ success: false, error: 'Refresh token expired or revoked' });
        return;
      }

      const tokenPayload = {
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name,
      };

      const newAccessToken = signAccessToken(tokenPayload);

      res.status(200).json({
        success: true,
        data: {
          accessToken: newAccessToken,
        },
      });
    } catch (error) {
      res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }
  }

  public static async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
          organizations: user.memberships.map((m) => ({
            id: m.organization.id,
            name: m.organization.name,
            slug: m.organization.slug,
            plan: m.organization.plan,
            role: m.role,
          })),
        },
      });
    } catch (error) {
      logger.error('Me endpoint error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  public static async logout(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await prisma.refreshToken.deleteMany({
          where: { token: refreshToken },
        });
      }
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.status(200).json({ success: true, message: 'Logged out' });
    }
  }
}
