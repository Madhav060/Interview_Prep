const Chat = require('../models/Chat');
const Document = require('../models/Document');
const mongoose = require('mongoose'); // Keep mongoose if needed for ObjectId validation

// --- ONLY REQUIRE functions from gemini.js ---
const {
  generateInterviewQuestions,
  evaluateAllAnswers,
  generateEmbedding,
  findSimilarChunks,
  // Removed generateChatResponse as it wasn't used here, keep if needed elsewhere
} = require('../utils/gemini');

// --- ALL DUPLICATED FUNCTION DEFINITIONS (retryWithBackoff, getTextGenerationModel, etc.) REMOVED ---
// --- Keep only the route handlers below ---

// @route   POST /api/chat/create-session
// @desc    Create an empty chat session (before documents uploaded)
// @access  Private
exports.createSession = async (req, res) => {
  try {
    // Validate user exists on request object
    const userId = req.user?._id; // Use optional chaining for safety
    if (!userId) {
      console.error('Auth Error: req.user._id is missing in createSession');
      return res.status(401).json({ success: false, message: 'Unauthorized: User not found in request' });
    }

    const { sessionName, numQuestions = 3 } = req.body;

    // Validate number of questions
    if (typeof numQuestions !== 'number' || !Number.isInteger(numQuestions) || numQuestions < 2 || numQuestions > 10) {
      return res.status(400).json({
        success: false,
        message: 'Number of questions must be an integer between 2 and 10',
      });
    }

    // Create NEW chat session
    const chat = new Chat({
      userId: userId, // Use the validated userId
      sessionName: sessionName || `Interview Session - ${new Date().toLocaleString()}`,
      totalQuestions: numQuestions,
      messages: [], // Initialize with empty messages
    });

    await chat.save();

    res.status(201).json({
      success: true,
      message: 'Session created successfully',
      sessionId: chat._id,
      sessionName: chat.sessionName,
      totalQuestions: chat.totalQuestions,
    });
  } catch (error) {
    console.error('Create session error:', error);
    // Avoid sending detailed internal errors to the client in production
    res.status(500).json({
      success: false,
      message: 'Server error creating session',
      // error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// @route   POST /api/chat/generate-questions/:sessionId
// @desc    Generate questions for a session after documents uploaded
// @access  Private
exports.generateQuestions = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?._id;

    // Validate inputs
    if (!userId) {
       console.error('Auth Error: req.user._id is missing in generateQuestions');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing Session ID' });
    }

    console.log(`📝 Generating questions for session: ${sessionId}, User: ${userId}`);

    // Get session, ensuring it belongs to the user
    const chat = await Chat.findOne({ _id: sessionId, userId: userId });
    if (!chat) {
      console.warn(`Session not found or doesn't belong to user: ${sessionId}`);
      return res.status(404).json({ success: false, message: 'Session not found or access denied' });
    }

    // Check if both required documents are uploaded specifically for this session
    const documents = await Document.find({
      userId: userId,
      sessionId: sessionId // Query specifically for this session's documents
    }).select('type chunks.text'); // Select only needed fields

    console.log(`📄 Found ${documents.length} documents for session ${sessionId}`);

    const resumeDoc = documents.find(doc => doc.type === 'resume');
    const jdDoc = documents.find(doc => doc.type === 'jd');

    if (!resumeDoc || !jdDoc) {
      console.warn(`Missing documents for session ${sessionId}: Resume=${!!resumeDoc}, JD=${!!jdDoc}`);
      return res.status(400).json({
        success: false,
        message: 'Please ensure both resume and job description are uploaded for this session',
      });
    }

    // Get JD text, limit length, handle potentially empty chunks
    const jdText = jdDoc.chunks
      ?.map(chunk => chunk.text)
      .filter(Boolean) // Filter out null/undefined/empty strings
      .join('\n\n') // Join non-empty chunks
      .substring(0, 4000); // Increased limit slightly, adjust as needed

    console.log(`📋 JD Text length for AI: ${jdText.length}`);

    if (jdText.length < 50) { // Add a minimum length check
        console.warn(`JD text for session ${sessionId} is too short after processing.`);
        return res.status(400).json({
            success: false,
            message: 'Job description text is too short or could not be extracted properly.',
        });
    }

    // Generate questions using the IMPORTED function from gemini.js
    let questionsText;
    try {
      console.log('🤖 Calling AI to generate questions...');
      // Ensure numQuestions is passed correctly from the chat object
      questionsText = await generateInterviewQuestions(jdText, chat.totalQuestions || 3);

      console.log(`✅ AI Response received, length: ${questionsText?.length}`);

      // Validate AI response (basic check, gemini.js handles detailed empty check)
      if (!questionsText || questionsText.trim().length === 0) {
        // This case should ideally be caught by gemini.js, but added as fallback
        throw new Error('AI service returned empty content');
      }
    } catch (aiError) {
      // Catch errors specifically from generateInterviewQuestions
      console.error(`❌ AI Question generation failed for session ${sessionId}:`, aiError.message);
      // Return the user-friendly error message thrown by gemini.js
      return res.status(500).json({
        success: false,
        message: aiError.message || 'Failed to generate questions. Please try again.',
      });
    }

    // Update chat: Replace existing messages or add if empty
    // Store only the generated questions as the first assistant message
    chat.messages = [
      {
        role: 'assistant',
        content: questionsText.trim(), // Store the raw generated text
      }
    ];
    // Reset completion status if regenerating questions
    chat.isCompleted = false;
    chat.finalScore = undefined;
    chat.averageRelevance = undefined;
    chat.averageCorrectness = undefined;


    await chat.save();
    console.log(`💾 Questions saved to database for session ${sessionId}`);

    res.status(200).json({
      success: true,
      message: 'Questions generated successfully',
      questions: questionsText, // Send raw text back
      sessionId: chat._id, // Include sessionId for confirmation
    });

  } catch (error) {
    // Catch broader errors (DB connection, unexpected issues)
    console.error(`❌ Unexpected error in generateQuestions for session ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Server error generating questions. Please try again.',
      // error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


// Helper function to parse questions text into structured array
const parseQuestions = (text) => {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const questions = [];
    const questionRegex = /^(\d+)\.\s*(.+)/; // Matches "1. Question text"

    for (const line of lines) {
        const match = line.match(questionRegex);
        if (match) {
            questions.push({
                number: parseInt(match[1], 10),
                text: match[2].trim()
            });
        } else {
            // Log if a line doesn't match the expected format
            console.warn(`parseQuestions: Skipping line, format mismatch: "${line.substring(0, 50)}..."`);
        }
    }
    return questions;
};

// Helper function to parse structured answers text
const parseAnswers = (text, expectedCount) => {
    if (!text || typeof text !== 'string') return null;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const answers = [];
    const answerRegex = /^(\d+)\.\s*([\s\S]+?)(?=(?:\n\d+\.\s+)|$)/; // Match "1. Answer text potentially multi-line"

    // Use regex exec in a loop to handle multi-line answers better
    let match;
    let lastIndex = 0;
    const multiLineAnswerRegex = /^(\d+)\.\s*([\s\S]*)/; // Simpler for potentially messy input

    // Basic split approach if regex fails
     const potentialAnswers = text.split(/^\d+\.\s*/gm).filter(Boolean); // Split by "1. " etc.

     if (potentialAnswers.length >= expectedCount) {
         for(let i = 0; i < expectedCount; i++) {
              if (potentialAnswers[i]) {
                  answers.push({ number: i + 1, text: potentialAnswers[i].trim() });
              }
         }
     } else {
         // Fallback or stricter parsing needed if format is critical
         console.warn(`parseAnswers: Could not reliably parse ${expectedCount} answers from text.`);
         return null; // Indicate parsing failure
     }


    // Validate count after parsing
    if (answers.length !== expectedCount) {
        console.warn(`parseAnswers: Parsed ${answers.length} answers, but expected ${expectedCount}.`);
        return null; // Return null if count doesn't match
    }

    return answers;
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

    // ✅ FIXED: Don't store AI's "score" field
    evaluations.forEach((evaluation, idx) => {
      chat.messages.push({
        role: 'assistant',
        content: `**Question ${idx + 1} Feedback:**\n${evaluation.feedback}`,
        // Only store relevanceScore and correctnessScore
        // We calculate overall ourselves in calculateFinalScores()
        relevanceScore: evaluation.relevanceScore,
        correctnessScore: evaluation.correctnessScore,
      });
    });

    // Mark as completed and calculate final scores
    chat.isCompleted = true;
    chat.calculateFinalScores();  // ✅ Now correctly calculates (Rel + Corr) / 2

    await chat.save();

    console.log('✅ Interview completed and scores saved');

    res.status(200).json({
      success: true,
      evaluations: evaluations.map((e, idx) => ({
        questionNumber: idx + 1,
        score: e.score,  // Still return AI's score to frontend for display
        relevanceScore: e.relevanceScore,
        correctnessScore: e.correctnessScore,
        feedback: e.feedback
      })),
      resumeChunksUsed: resumeChunks.map((item, idx) => ({
        index: idx + 1,
        text: item.chunk.text.substring(0, 200) + '...',
        similarity: item.similarity.toFixed(3),
      })),
      isCompleted: true,
      finalScore: chat.finalScore,  // ✅ Correctly calculated average
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
// @desc    Get all chat sessions for the authenticated user
// @access  Private
exports.getChatSessions = async (req, res) => {
  try {
     const userId = req.user?._id;
     if (!userId) {
       return res.status(401).json({ success: false, message: 'Unauthorized' });
     }

    // Find sessions, select specific fields, sort by most recent
    const sessions = await Chat.find({ userId: userId })
      .select('sessionName totalQuestions isCompleted finalScore averageRelevance averageCorrectness createdAt updatedAt')
      .sort({ createdAt: -1 }); // Sort by creation date, newest first

    // Map sessions to a cleaner format for the client
    res.status(200).json({
      success: true,
      sessions: sessions.map(session => ({
        id: session._id,
        sessionName: session.sessionName,
        totalQuestions: session.totalQuestions,
        isCompleted: session.isCompleted,
        finalScore: session.finalScore, // Already calculated
        averageRelevance: session.averageRelevance, // Already calculated
        averageCorrectness: session.averageCorrectness, // Already calculated
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
// @desc    Get a specific chat session by ID, including messages
// @access  Private
exports.getChatSession = async (req, res) => {
  try {
     const userId = req.user?._id;
     const { id: sessionId } = req.params;

     if (!userId) {
       return res.status(401).json({ success: false, message: 'Unauthorized' });
     }
     if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
       return res.status(400).json({ success: false, message: 'Invalid Session ID' });
     }

    // Find the chat session, ensuring it belongs to the logged-in user
    const chat = await Chat.findOne({
      _id: sessionId,
      userId: userId, // Security check: user must own the session
    }); // No .select() needed here, we want all fields including messages

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found or access denied',
      });
    }

    // Return the full chat object, possibly mapping to a client-friendly format if needed
    res.status(200).json({
      success: true,
      // Map to ensure consistent structure and only send necessary data
      session: {
        id: chat._id,
        sessionName: chat.sessionName,
        totalQuestions: chat.totalQuestions,
        messages: chat.messages.map(msg => ({ // Map messages for structure
            role: msg.role,
            content: msg.content,
            score: msg.score,
            relevanceScore: msg.relevanceScore,
            correctnessScore: msg.correctnessScore,
            timestamp: msg.timestamp
        })),
        isCompleted: chat.isCompleted,
        finalScore: chat.finalScore,
        averageRelevance: chat.averageRelevance,
        averageCorrectness: chat.averageCorrectness,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    });
  } catch (error) {
    console.error(`Get session error for ID ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat session details',
    });
  }
};

// @route   DELETE /api/chat/session/:id
// @desc    Delete a specific chat session and its associated documents
// @access  Private
exports.deleteChatSession = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { id: sessionId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
     if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
       return res.status(400).json({ success: false, message: 'Invalid Session ID' });
     }

     console.log(`🗑️ Attempting to delete session: ${sessionId} for user: ${userId}`);

    // Use findOneAndDelete to get the document and delete atomically, ensuring user owns it
    const chat = await Chat.findOneAndDelete({
      _id: sessionId,
      userId: userId, // User must own the session
    });

    if (!chat) {
       console.warn(`Delete session: Session not found or access denied for ${sessionId}`);
      return res.status(404).json({
        success: false,
        message: 'Chat session not found or access denied',
      });
    }

    // Delete associated documents (Resume and JD) specifically linked to this session
    const deleteResult = await Document.deleteMany({
      userId: userId,
      sessionId: sessionId, // Only documents for this session
    });

    console.log(`🧹 Deleted ${deleteResult.deletedCount} associated documents for session ${sessionId}`);

    res.status(200).json({
      success: true,
      message: `Chat session '${chat.sessionName}' and associated documents deleted successfully`,
    });
  } catch (error) {
    console.error(`Delete session error for ID ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error deleting chat session',
    });
  }
};

