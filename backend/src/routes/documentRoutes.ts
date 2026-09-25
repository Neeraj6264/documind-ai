import { Router } from 'express';
import { DocumentController } from '../controllers/documentController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { uploadMiddleware } from '../middleware/upload.js';

const router = Router();

// Every document operation is strictly guarded by user auth AND verified tenant context
router.use(requireAuth);
router.use(requireTenant);

router.post('/upload', uploadMiddleware.single('file'), DocumentController.uploadDocument);
router.get('/', DocumentController.listDocuments);
router.get('/:id', DocumentController.getDocument);
router.get('/:id/chunks', DocumentController.getDocumentChunks);
router.delete('/:id', DocumentController.deleteDocument);

export default router;
