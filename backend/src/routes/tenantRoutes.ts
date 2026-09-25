import { Router } from 'express';
import { TenantController } from '../controllers/tenantController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant, requireTenantRole } from '../middleware/tenant.js';

const router = Router();

// Routes requiring authentication
router.use(requireAuth);

// List all organizations the user belongs to
router.get('/', TenantController.listOrganizations);
// Create a new organization
router.post('/', TenantController.createOrganization);

// Current organization context routes
router.get('/current', requireTenant, TenantController.getCurrentOrganization);
router.patch(
  '/settings',
  requireTenant,
  requireTenantRole(['OWNER', 'ADMIN']),
  TenantController.updateSettings
);
router.post(
  '/members',
  requireTenant,
  requireTenantRole(['OWNER', 'ADMIN']),
  TenantController.inviteMember
);
router.delete(
  '/members/:userId',
  requireTenant,
  requireTenantRole(['OWNER', 'ADMIN']),
  TenantController.removeMember
);

export default router;
