const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Retry wrapper for API calls with exponential backoff
 */
async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isLastRetry = i === retries - 1;
      const isRateLimitError = error.status === 503 || error.status === 429 || error.message?.includes('overloaded');
      
      if (isLastRetry || !isRateLimitError) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${retries} after ${delay}ms due to: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Get the best available model for text generation
 * Changed to the latest stable flash model.
 */
function getTextGenerationModel(config = {}) {
  // Using the latest flash model for high-speed, stable generation
  const modelName = 'gemini-2.5-flash-preview-09-2025';
  
  return genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      ...config,
    },
  });
}

/**
 * Generate embedding for text using Gemini
 */
exports.generateEmbedding = async (text) => {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Text for embedding cannot be empty');
    }

    return await retryWithBackoff(async () => {
      const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent(text);
      
      if (!result.embedding || !result.embedding.values) {
        throw new Error('Invalid embedding response');
      }
      
      return result.embedding.values;
    });
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding: ' + error.message);
  }
};

/**
 * Generate embeddings for multiple text chunks
 */
exports.generateEmbeddings = async (texts) => {
  try {
    if (!texts || texts.length === 0) {
      throw new Error('No texts provided for embeddings');
    }

    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    // Generate embeddings for each text chunk with retry
    // NOTE: Switched to a sequential loop to avoid rate-limiting
    const embeddings = [];
    for (const text of texts) {
      const result = await retryWithBackoff(async () => {
        const res = await model.embedContent(text);
        return res.embedding.values;
      });
      embeddings.push(result);
    }
    
    return embeddings;
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw new Error('Failed to generate embeddings: ' + error.message);
  }
};

/**
 * Generate chat response using Gemini
 */
exports.generateChatResponse = async (prompt) => {
  try {
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty');
    }

    return await retryWithBackoff(async () => {
      const model = getTextGenerationModel({
        temperature: 0.7,
        maxOutputTokens: 1024,
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      if (!text || text.trim().length === 0) {
        throw new Error('Empty response from AI');
      }
      
      return text;
    });
  } catch (error) {
    console.error('Error generating chat response:', error);
    throw new Error('Failed to generate chat response: ' + error.message);
  }
};

/**
 * Generate interview questions from job description
 * @param {string} jdText - Job description text
 * @param {number} numQuestions - Number of questions to generate (default: 3)
 */
exports.generateInterviewQuestions = async (jdText, numQuestions = 3) => {
  try {
    // Validate inputs
    if (!jdText || jdText.trim().length === 0) {
      throw new Error('Job description text is required');
    }

    if (numQuestions < 2 || numQuestions > 10) {
      throw new Error('Number of questions must be between 2 and 10');
    }

    const technicalCount = numQuestions - 1; // Last one will be behavioral
    
    const prompt = `You are a professional technical interviewer. Based on the following job description, generate exactly ${numQuestions} relevant interview questions.

Job Description:
${jdText}

Requirements:
- Generate exactly ${numQuestions} questions total
- First ${technicalCount} question(s) should be TECHNICAL/ROLE-SPECIFIC based on the job requirements and technologies mentioned
- The LAST question (question ${numQuestions}) MUST be a BEHAVIORAL question about teamwork, leadership, problem-solving, or conflict resolution
- Make technical questions specific to the role and technologies mentioned in the JD
- Keep all questions clear, concise, and realistic
- Format EXACTLY as: "1. [Question text]" on separate lines

Generate the questions now:`;

    const result = await retryWithBackoff(async () => {
      const model = getTextGenerationModel({
        temperature: 0.8,
        maxOutputTokens: 800,
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Validate response
      if (!text || text.trim().length === 0) {
        throw new Error('Empty response from AI model');
      }

      // Check if response contains questions in the expected format
      const hasNumberedQuestions = /\d+\.\s+.+/.test(text);
      if (!hasNumberedQuestions) {
        console.warn('Response does not contain properly formatted questions');
      }
      
      return text.trim();
    });

    return result;
  } catch (error) {
    console.error('Error generating questions:', error);
    
    // Provide user-friendly error messages
    if (error.status === 503) {
      throw new Error('AI service is temporarily overloaded. Please try again in 30-60 seconds.');
    } else if (error.status === 429) {
      throw new Error('Rate limit reached. Please wait a minute and try again.');
    } else if (error.status === 404) {
      throw new Error('AI model not available. Please check your API configuration.');
    } else if (error.status === 400) {
      throw new Error('Invalid request to AI service. Please try with a different job description.');
    } else if (error.message?.includes('overloaded')) {
      throw new Error('AI service is currently busy. Please try again shortly.');
    } else if (error.message?.includes('quota')) {
      throw new Error('API quota exceeded. Please check your Gemini API usage limits.');
    } else {
      throw new Error(`Unable to generate questions: ${error.message}`);
    }
  }
};

/**
 * Evaluate ALL answers at once with detailed scoring
 * @param {Array} questionsAndAnswers - Array of {question, answer} objects
 * @param {string} resumeContext - Combined resume context
 */
exports.evaluateAllAnswers = async (questionsAndAnswers, resumeContext) => {
  try {
    // Validate inputs
    if (!questionsAndAnswers || questionsAndAnswers.length === 0) {
      throw new Error('No questions and answers provided for evaluation');
    }

    if (!resumeContext || resumeContext.trim().length === 0) {
      console.warn('No resume context provided for evaluation');
      resumeContext = 'No resume context available';
    }

    const qaText = questionsAndAnswers.map((qa, idx) => 
      `Question ${idx + 1}: ${qa.question}\nCandidate's Answer: ${qa.answer}`
    ).join('\n\n');

    const prompt = `You are an expert interview evaluator. Evaluate the candidate's responses to ALL interview questions with DETAILED SCORING.

Interview Questions and Answers:
${qaText}

Relevant Context from Candidate's Resume:
${resumeContext}

Task:
For EACH question, provide THREE separate scores (1-10 scale where 10 is excellent):

1. **Relevance Score** (1-10): How relevant is the answer to the question asked?
2. **Correctness Score** (1-10): How accurate/correct is the technical content or reasoning?
3. **Overall Score** (1-10): Combined assessment of the response quality

Then provide constructive feedback (maximum 100 words per answer) that:
- Highlights what the candidate did well
- Points out areas for improvement
- Considers the candidate's resume context
- Gives specific, actionable advice

Format your response EXACTLY as follows for EACH question:

Question 1:
Relevance: [number]/10
Correctness: [number]/10
Overall: [number]/10
Feedback: [your detailed feedback here]

Question 2:
Relevance: [number]/10
Correctness: [number]/10
Overall: [number]/10
Feedback: [your detailed feedback here]

[Continue for all questions...]

Evaluate now:`;

    return await retryWithBackoff(async () => {
      const model = getTextGenerationModel({
        temperature: 0.5,
        maxOutputTokens: 2048,
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error('Empty evaluation response');
      }

      // Parse the response for each question
      const evaluations = [];
      const questionBlocks = text.split(/Question \d+:/i).filter(block => block.trim());

      for (let i = 0; i < questionBlocks.length; i++) {
        const block = questionBlocks[i];
        
        const relevanceMatch = block.match(/Relevance:\s*(\d+)/i);
        const correctnessMatch = block.match(/Correctness:\s*(\d+)/i);
        const overallMatch = block.match(/Overall:\s*(\d+)/i);
        const feedbackMatch = block.match(/Feedback:\s*(.+?)(?=\n\n|\n*$)/is);

        let relevanceScore = relevanceMatch ? parseInt(relevanceMatch[1]) : 5;
        let correctnessScore = correctnessMatch ? parseInt(correctnessMatch[1]) : 5;
        let overallScore = overallMatch ? parseInt(overallMatch[1]) : Math.round((relevanceScore + correctnessScore) / 2);
        const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'Good effort. Consider providing more specific details and examples in your answers.';

        // Clamp scores to valid range (1-1D)
        relevanceScore = Math.max(1, Math.min(10, relevanceScore));
        correctnessScore = Math.max(1, Math.min(10, correctnessScore));
        overallScore = Math.max(1, Math.min(10, overallScore));

        evaluations.push({
          score: overallScore,
          relevanceScore,
          correctnessScore,
          feedback
        });
      }

      // Ensure we have evaluations for all questions
      while (evaluations.length < questionsAndAnswers.length) {
        evaluations.push({
          score: 5,
          relevanceScore: 5,
          correctnessScore: 5,
          feedback: 'Unable to generate detailed feedback for this question. Your answer has been noted.'
        });
      }

      // If we have too many evaluations, trim to match questions
      if (evaluations.length > questionsAndAnswers.length) {
        evaluations.length = questionsAndAnswers.length;
      }

      return evaluations;
    });
  } catch (error) {
    console.error('Error evaluating responses:', error);
    
    // Return default evaluations if API fails completely
    console.log('Returning fallback evaluations due to error');
    return questionsAndAnswers.map(() => ({
      score: 5,
      relevanceScore: 5,
      correctnessScore: 5,
      feedback: 'Unable to evaluate at this time due to technical issues. Please try again later or contact support if the problem persists.'
    }));
  }
};

/**
 * Calculate cosine similarity between two vectors
 */
exports.cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    throw new Error('Invalid vectors for similarity calculation');
  }

  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
};

/**
 * Find most similar chunks using cosine similarity
 */
exports.findSimilarChunks = (queryEmbedding, chunks, topK = 3) => {
  if (!queryEmbedding || !chunks || chunks.length === 0) {
    console.warn('Invalid inputs for findSimilarChunks');
    return [];
  }

  try {
    const similarities = chunks
      .map((chunk, index) => ({
        index,
        chunk,
        similarity: exports.cosineSimilarity(queryEmbedding, chunk.embedding)
      }))
      .filter(item => !isNaN(item.similarity)); // Filter out invalid similarities
    
    // Sort by similarity (highest first) and return top K
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  } catch (error) {
    console.error('Error finding similar chunks:', error);
    return [];
  }
};

