const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    default: null // null means global document (old flow), otherwise session-specific
  },
  type: {
    type: String,
    enum: ['resume', 'jd'],
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  chunks: [{
    text: {
      type: String,
      required: true
    },
    embedding: {
      type: [Number],
      required: true
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
documentSchema.index({ userId: 1, type: 1, sessionId: 1 });

module.exports = mongoose.model('Document', documentSchema);