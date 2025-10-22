const express = require('express');
const router = express.Router();
const {
  uploadMiddleware,
  uploadDocument,
  uploadForSession,
  listDocuments,
  deleteDocument,
  checkDocuments,
  getSessionDocuments,
} = require('../controllers/documentController');
const { protect } = require('../middleware/auth');

router.post('/upload', protect, uploadMiddleware, uploadDocument);
router.post('/upload-for-session', protect, uploadMiddleware, uploadForSession);
router.get('/list', protect, listDocuments);
router.get('/check', protect, checkDocuments);
router.get('/session/:sessionId', protect, getSessionDocuments);
router.delete('/:id', protect, deleteDocument);

module.exports = router;