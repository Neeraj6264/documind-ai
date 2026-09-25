import { Router } from 'express';
import { ChatController } from '../controllers/chatController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.post('/message', ChatController.sendMessage);
router.get('/conversations', ChatController.listConversations);
router.get('/conversations/:id', ChatController.getConversation);
router.delete('/conversations/:id', ChatController.deleteConversation);

export default router;
