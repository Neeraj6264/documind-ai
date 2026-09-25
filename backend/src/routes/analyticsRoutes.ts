import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get('/metrics', AnalyticsController.getTenantMetrics);

export default router;
