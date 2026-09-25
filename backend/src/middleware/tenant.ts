import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { prisma } from '../db/prisma.js';
import { Role } from '@prisma/client';

export const requireTenant = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      return;
    }

    const requestedOrgId =
      (req.headers['x-organization-id'] as string) ||
      (req.headers['x-tenant-id'] as string) ||
      (req.query.organizationId as string) ||
      (req.query.orgId as string);

    let membership;

    if (requestedOrgId) {
      // Security: Never trust client-supplied org ID without verifying membership!
      membership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: requestedOrgId,
            userId: req.user.id,
          },
        },
        include: {
          organization: true,
        },
      });

      if (!membership) {
        res.status(403).json({
          success: false,
          error: 'Forbidden: You do not have access to this organization or workspace',
        });
        return;
      }
    } else {
      // Default to the user's default/first organization
      membership = await prisma.organizationMember.findFirst({
        where: {
          userId: req.user.id,
        },
        include: {
          organization: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (!membership) {
        res.status(404).json({
          success: false,
          error: 'No organization found for this user. Please create or join an organization.',
        });
        return;
      }
    }

    req.tenant = {
      organization: membership.organization,
      membership,
      role: membership.role,
    };

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error resolving tenant context',
    });
  }
};

export const requireTenantRole = (allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      res.status(403).json({ success: false, error: 'Tenant context required' });
      return;
    }

    if (!allowedRoles.includes(req.tenant.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: This action requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
};
