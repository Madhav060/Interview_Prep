const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionName: {
    type: String,
    default: function() {
      return `Interview Session - ${new Date().toLocaleDateString()}`;
    }
  },
  totalQuestions: {
    type: Number,
    default: 3
  },
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    score: {
      type: Number,
      min: 0,
      max: 10
    },
    relevanceScore: {
      type: Number,
      min: 0,
      max: 10
    },
    correctnessScore: {
      type: Number,
      min: 0,
      max: 10
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  isCompleted: {
    type: Boolean,
    default: false
  },
  finalScore: {
    type: Number,
    min: 0,
    max: 10
  },
  averageRelevance: {
    type: Number,
    min: 0,
    max: 10
  },
  averageCorrectness: {
    type: Number,
    min: 0,
    max: 10
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

chatSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate final scores
chatSchema.methods.calculateFinalScores = function() {
  const scoredMessages = this.messages.filter(msg => msg.score !== undefined);
  
  if (scoredMessages.length === 0) {
    return;
  }

  const totalScore = scoredMessages.reduce((sum, msg) => sum + msg.score, 0);
  const totalRelevance = scoredMessages.reduce((sum, msg) => sum + (msg.relevanceScore || 0), 0);
  const totalCorrectness = scoredMessages.reduce((sum, msg) => sum + (msg.correctnessScore || 0), 0);

  this.finalScore = (totalScore / scoredMessages.length).toFixed(1);
  this.averageRelevance = (totalRelevance / scoredMessages.length).toFixed(1);
  this.averageCorrectness = (totalCorrectness / scoredMessages.length).toFixed(1);
};

module.exports = mongoose.model('Chat', chatSchema);