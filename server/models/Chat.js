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
    default: 3,
    min: 2,
    max: 10
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

/**
 * Calculate final scores based on evaluation messages
 * FIXED: Now correctly calculates overall as average of relevance and correctness
 */
chatSchema.methods.calculateFinalScores = function() {
  // Filter messages that have scores (evaluation messages from assistant)
  const scoredMessages = this.messages.filter(msg =>
    msg.role === 'assistant' &&
    typeof msg.relevanceScore === 'number' &&
    typeof msg.correctnessScore === 'number'
  );

  if (scoredMessages.length === 0) {
    console.warn(`No valid scored messages found for chat ${this._id}`);
    this.finalScore = undefined;
    this.averageRelevance = undefined;
    this.averageCorrectness = undefined;
    return;
  }

  // Calculate sums
  let totalRelevance = 0;
  let totalCorrectness = 0;

  scoredMessages.forEach(msg => {
    totalRelevance += parseFloat(msg.relevanceScore) || 0;
    totalCorrectness += parseFloat(msg.correctnessScore) || 0;
  });

  // Calculate averages
  const avgRelevance = totalRelevance / scoredMessages.length;
  const avgCorrectness = totalCorrectness / scoredMessages.length;

  // Store with proper precision (1 decimal place)
  this.averageRelevance = parseFloat(avgRelevance.toFixed(1));
  this.averageCorrectness = parseFloat(avgCorrectness.toFixed(1));
  
  // FIXED: Final score is the average of relevance and correctness
  this.finalScore = parseFloat(((avgRelevance + avgCorrectness) / 2).toFixed(1));

  console.log(`✅ Calculated scores for session ${this._id}:`);
  console.log(`   - Relevance: ${this.averageRelevance}/10`);
  console.log(`   - Correctness: ${this.averageCorrectness}/10`);
  console.log(`   - Final: ${this.finalScore}/10`);
  console.log(`   - Based on ${scoredMessages.length} questions`);
};

module.exports = mongoose.model('Chat', chatSchema);