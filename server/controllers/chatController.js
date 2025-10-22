const Chat = require('../models/Chat');
const Document = require('../models/Document');
const {
  generateInterviewQuestions,
  evaluateAllAnswers,
  generateEmbedding,
  findSimilarChunks,
} = require('../utils/gemini');

// @route   POST /api/chat/create-session
// @desc    Create an empty chat session (before documents uploaded)
// @access  Private
exports.createSession = async (req, res) => {
  try {
    const { sessionName, numQuestions = 3 } = req.body;

    // Validate number of questions
    if (numQuestions < 2 || numQuestions > 10) {
      return res.status(400).json({
        success: false,
        message: 'Number of questions must be between 2 and 10',
      });
    }

    // Create NEW chat session
    const chat = new Chat({
      userId: req.user._id,
      sessionName: sessionName || `Interview Session - ${new Date().toLocaleString()}`,
      totalQuestions: numQuestions,
      messages: [],
    });

    await chat.save();

    res.status(201).json({
      success: true,
      message: 'Session created',
      sessionId: chat._id,
      sessionName: chat.sessionName,
      totalQuestions: numQuestions,
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating session',
      error: error.message,
    });
  }
};

// @route   POST /api/chat/generate-questions/:sessionId
// @desc    Generate questions for a session after documents uploaded
// @access  Private
// @route   POST /api/chat/generate-questions/:sessionId
// @desc    Generate questions for a session after documents uploaded
// @access  Private
exports.generateQuestions = async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log('📝 Generating questions for session:', sessionId);

    // Get session
    const chat = await Chat.findOne({ _id: sessionId, userId: req.user._id });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    // Check if both documents are uploaded for this session
    const documents = await Document.find({ 
      userId: req.user._id, 
      sessionId 
    });
    
    console.log('📄 Found documents:', documents.length);

    const resumeDoc = documents.find(doc => doc.type === 'resume');
    const jdDoc = documents.find(doc => doc.type === 'jd');

    if (!resumeDoc || !jdDoc) {
      return res.status(400).json({
        success: false,
        message: 'Please upload both resume and job description first',
      });
    }

    // Get JD text (limit to avoid token limits)
    const jdText = jdDoc.chunks
      .map(chunk => chunk.text)
      .join('\n\n')
      .substring(0, 3000);

    console.log('📋 JD Text length:', jdText.length);

    // Generate questions with proper error handling
    let questionsText;
    try {
      console.log('🤖 Calling AI to generate questions...');
      questionsText = await generateInterviewQuestions(jdText, chat.totalQuestions);
      
      console.log('✅ AI Response received, length:', questionsText?.length);

      // Validate that questions were generated
      if (!questionsText || questionsText.trim().length === 0) {
        throw new Error('AI returned empty response');
      }
    } catch (error) {
      console.error('❌ Question generation failed:', error.message);
      
      // Return user-friendly error
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate questions. Please try again.',
      });
    }

    // Add questions to chat only if we have valid content
    chat.messages = [
      {
        role: 'assistant',
        content: questionsText.trim(),
      }
    ];

    await chat.save();

    console.log('💾 Questions saved to database');

    res.status(200).json({
      success: true,
      message: 'Questions generated successfully',
      questions: questionsText,
    });
  } catch (error) {
    console.error('❌ Generate questions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating questions. Please try again.',
      error: error.message,
    });
  }
};

// Helper function to parse questions from text
const parseQuestions = (text) => {
  const lines = text.split('\n').filter(line => line.trim());
  const questions = [];
  
  for (let line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)/);
    if (match) {
      questions.push({
        number: parseInt(match[1]),
        text: match[2].trim()
      });
    }
  }
  
  return questions;
};

// Helper function to parse answers from user input
const parseAnswers = (text, expectedCount) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const answers = [];
  
  for (let line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)/);
    if (match) {
      answers.push({
        number: parseInt(match[1]),
        text: match[2].trim()
      });
    }
  }
  
  return answers.length === expectedCount ? answers : null;
};

// @route   POST /api/chat/submit-answers
// @desc    Submit all answers at once and get evaluation
// @access  Private
exports.submitAnswers = async (req, res) => {
  try {
    const { answersText, chatId } = req.body;

    if (!answersText || !answersText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Answers are required',
      });
    }

    // Get chat session
    let chat = await Chat.findOne({ _id: chatId, userId: req.user._id });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
      });
    }

    // Get questions
    const questionsText = chat.messages[0]?.content || '';
    const questions = parseQuestions(questionsText);

    if (questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No questions found in session',
      });
    }

    // Parse answers
    const answers = parseAnswers(answersText, questions.length);
    
    if (!answers) {
      return res.status(400).json({
        success: false,
        message: `Please provide exactly ${questions.length} answers in the format: "1. Your answer\\n2. Your answer\\n..." `,
      });
    }

    // Get session-specific documents
    const documents = await Document.find({ 
      userId: req.user._id,
      sessionId: chatId 
    });
    
    const resumeDoc = documents.find(doc => doc.type === 'resume');

    if (!resumeDoc) {
      return res.status(400).json({
        success: false,
        message: 'Resume not found for this session',
      });
    }

    // Combine all answers for embedding
    const combinedAnswers = answers.map(a => a.text).join(' ');
    const queryEmbedding = await generateEmbedding(combinedAnswers);

    // Find similar chunks from resume (RAG)
    const resumeChunks = findSimilarChunks(queryEmbedding, resumeDoc.chunks, 3);
    const resumeContext = resumeChunks
      .map(item => item.chunk.text)
      .join('\n\n');

    // Prepare questions and answers for evaluation
    const questionsAndAnswers = questions.map((q, idx) => ({
      question: q.text,
      answer: answers[idx]?.text || ''
    }));

    // Evaluate all answers at once
    const evaluations = await evaluateAllAnswers(questionsAndAnswers, resumeContext);

    // Add user answers
    chat.messages.push({
      role: 'user',
      content: answersText,
    });

    // Add individual evaluations
    evaluations.forEach((evaluation, idx) => {
      chat.messages.push({
        role: 'assistant',
        content: `**Question ${idx + 1} Feedback:**\n${evaluation.feedback}`,
        score: evaluation.score,
        relevanceScore: evaluation.relevanceScore,
        correctnessScore: evaluation.correctnessScore,
      });
    });

    // Mark as completed and calculate final scores
    chat.isCompleted = true;
    chat.calculateFinalScores();

    await chat.save();

    res.status(200).json({
      success: true,
      evaluations: evaluations.map((e, idx) => ({
        questionNumber: idx + 1,
        ...e
      })),
      resumeChunksUsed: resumeChunks.map((item, idx) => ({
        index: idx + 1,
        text: item.chunk.text.substring(0, 200) + '...',
        similarity: item.similarity.toFixed(3),
      })),
      isCompleted: true,
      finalScore: chat.finalScore,
      averageRelevance: chat.averageRelevance,
      averageCorrectness: chat.averageCorrectness,
    });
  } catch (error) {
    console.error('Submit answers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing answers',
      error: error.message,
    });
  }
};

// @route   GET /api/chat/sessions
// @desc    Get all chat sessions for user
// @access  Private
exports.getChatSessions = async (req, res) => {
  try {
    const sessions = await Chat.find({ userId: req.user._id })
      .select('sessionName totalQuestions isCompleted finalScore averageRelevance averageCorrectness createdAt updatedAt')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      sessions: sessions.map(session => ({
        id: session._id,
        sessionName: session.sessionName,
        totalQuestions: session.totalQuestions,
        isCompleted: session.isCompleted,
        finalScore: session.finalScore,
        averageRelevance: session.averageRelevance,
        averageCorrectness: session.averageCorrectness,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat sessions',
    });
  }
};

// @route   GET /api/chat/session/:id
// @desc    Get specific chat session with messages
// @access  Private
exports.getChatSession = async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
      });
    }

    res.status(200).json({
      success: true,
      session: {
        id: chat._id,
        sessionName: chat.sessionName,
        totalQuestions: chat.totalQuestions,
        messages: chat.messages,
        isCompleted: chat.isCompleted,
        finalScore: chat.finalScore,
        averageRelevance: chat.averageRelevance,
        averageCorrectness: chat.averageCorrectness,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat session',
    });
  }
};

// @route   DELETE /api/chat/session/:id
// @desc    Delete a chat session
// @access  Private
exports.deleteChatSession = async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
      });
    }

    // Delete associated documents
    await Document.deleteMany({
      userId: req.user._id,
      sessionId: chat._id,
    });

    // Delete chat session
    await Chat.deleteOne({ _id: chat._id });

    res.status(200).json({
      success: true,
      message: 'Chat session deleted successfully',
    });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting chat session',
    });
  }
};