import { Request } from 'express';
import { User, Organization, OrganizationMember, Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface TenantContext {
  organization: Organization;
  membership: OrganizationMember;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  tenant?: TenantContext;
}

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
}

export interface QuerySearchResult {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  similarity: number;
}
