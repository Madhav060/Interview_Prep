const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createSession,
  generateQuestions,
  submitAnswers,
  getChatSessions,
  getChatSession,
  deleteChatSession,
} = require('../controllers/chatController');

router.post('/create-session', protect, createSession);
router.post('/generate-questions/:sessionId', protect, generateQuestions);
router.post('/submit-answers', protect, submitAnswers);
router.get('/sessions', protect, getChatSessions);
router.get('/session/:id', protect, getChatSession);
router.delete('/session/:id', protect, deleteChatSession);

module.exports = router;