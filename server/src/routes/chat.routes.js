const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');

const chatController = require('../controllers/chat.controller');

const router = express.Router();
router.use(requireAuth);

router.post('/message', chatController.sendMessage);
router.post('/action', chatController.applyAction);
router.get('/conversations', chatController.listConversations);
router.get('/conversations/:id', chatController.getConversation);
router.delete('/conversations/:id', chatController.deleteConversation);

module.exports = router;
