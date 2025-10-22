const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
if (!process.env.GEMINI_API_KEY) {
  console.error("FATAL ERROR: GEMINI_API_KEY environment variable is not set.");
  // Optional: exit the process if the key is absolutely required at startup
  // process.exit(1);
}
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
      // Check error status code, accommodating different error structures
      const status = error?.status || error?.response?.status;
      const isRateLimitError = status === 503 || status === 429 || error.message?.includes('overloaded') || error.message?.includes('rate limit');

      if (isLastRetry || !isRateLimitError) {
        // Log the final error before throwing
        console.error(`Final attempt failed or error is not retryable. Error: ${error.message}`);
        throw error; // Rethrow original error if not retryable or last attempt
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${retries} after ${delay}ms due to: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // This part should theoretically not be reached if the loop always throws on the last retry,
  // but added as a safeguard.
  throw new Error(`API call failed after ${retries} retries.`);
}

/**
 * Get the configured text generation model instance.
 * Using the latest stable flash model.
 */
function getTextGenerationModel(config = {}) {
  const modelName = 'gemini-2.5-flash-preview-09-2025';

  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.7, // Default temperature
      maxOutputTokens: 1024, // Default max tokens
      ...config, // Allow overriding defaults passed in
    },
     // Using moderate safety settings - adjust if needed
     safetySettings: [
       { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
       { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
       { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
       { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
     ],
  });
}

/**
 * Generate embedding for text using Gemini's embedding model.
 */
exports.generateEmbedding = async (text) => {
  try {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Text for embedding must be a non-empty string');
    }

    return await retryWithBackoff(async () => {
      const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent(text);

      // Validate the structure of the embedding response
      if (!result?.embedding?.values || !Array.isArray(result.embedding.values) || result.embedding.values.length === 0) {
        console.error('Unexpected embedding response structure:', JSON.stringify(result, null, 2));
        throw new Error('Invalid or empty embedding vector received from API');
      }

      return result.embedding.values;
    });
  } catch (error) {
    console.error(`Error generating embedding for text snippet "${text.substring(0, 50)}...":`, error);
    // Rethrow a consistent error message
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
};

/**
 * Generate embeddings for multiple text chunks sequentially to avoid rate limits.
 */
exports.generateEmbeddings = async (texts) => {
  try {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Input must be a non-empty array of texts for embeddings');
    }

    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const embeddings = [];
    const embeddingDimension = 768; // Standard dimension for text-embedding-004

    // Use a sequential for...of loop
    for (const text of texts) {
       // Ensure text is a non-empty string before embedding
       if (!text || typeof text !== 'string' || text.trim().length === 0) {
           console.warn('Skipping empty or invalid text chunk for embedding.');
           // Push an array of zeros as a placeholder, matching the expected dimension
           embeddings.push(new Array(embeddingDimension).fill(0));
           continue;
       }

       try {
            const result = await retryWithBackoff(async () => {
                const res = await model.embedContent(text);
                if (!res?.embedding?.values || !Array.isArray(res.embedding.values) || res.embedding.values.length !== embeddingDimension) {
                    console.error('Unexpected embedding response structure or dimension for chunk:', JSON.stringify(res, null, 2));
                    throw new Error(`Invalid embedding response for chunk (expected dim ${embeddingDimension})`);
                }
                return res.embedding.values;
            });
            embeddings.push(result);
       } catch (chunkError) {
           // If a single chunk fails after retries, log it and add a placeholder
           console.error(`Failed to generate embedding for chunk "${text.substring(0,50)}..." after retries:`, chunkError);
           embeddings.push(new Array(embeddingDimension).fill(0)); // Placeholder
       }
    }

    // Now all elements in embeddings should be arrays of numbers
    return embeddings;

  } catch (error) {
    // Catch broader errors like initialization failure
    console.error('Error in generateEmbeddings function:', error);
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
};


/**
 * Generate a generic chat response using Gemini.
 */
exports.generateChatResponse = async (prompt) => {
  try {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Prompt must be a non-empty string');
    }

    return await retryWithBackoff(async () => {
      const model = getTextGenerationModel({
        temperature: 0.7,
        maxOutputTokens: 1024, // Standard default for chat
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Check for empty response and log reason
      if (!text || text.trim().length === 0) {
        const finishReason = response?.candidates?.[0]?.finishReason;
        const safetyRatings = response?.promptFeedback?.safetyRatings;
        console.error('❌ AI returned an empty chat response.');
        console.error('Finish Reason:', finishReason);
        console.error('Safety Ratings:', JSON.stringify(safetyRatings, null, 2));
         if (finishReason === 'SAFETY') {
             throw new Error('Chat response blocked due to safety filters.');
         } else if (finishReason === 'MAX_TOKENS') {
             throw new Error('Chat response exceeded maximum length.');
         }
        throw new Error('Empty response received from AI model');
      }

      return text;
    });
  } catch (error) {
    console.error('Error generating chat response:', error);
     throw new Error(`Failed to generate chat response: ${error.message}`);
  }
};

/**
 * Generate interview questions from job description text.
 */
exports.generateInterviewQuestions = async (jdText, numQuestions = 3) => {
  try {
    // Input validation
    if (!jdText || typeof jdText !== 'string' || jdText.trim().length === 0) {
      throw new Error('Job description text must be a non-empty string');
    }
    if (typeof numQuestions !== 'number' || !Number.isInteger(numQuestions) || numQuestions < 2 || numQuestions > 10) {
      throw new Error('Number of questions must be an integer between 2 and 10');
    }

    const technicalCount = numQuestions - 1;

    const prompt = `You are a professional technical interviewer. Based on the following job description, generate exactly ${numQuestions} relevant interview questions.

Job Description:
${jdText}

Requirements:
- Generate exactly ${numQuestions} questions total.
- The first ${technicalCount} question(s) MUST be TECHNICAL and/or ROLE-SPECIFIC, directly related to the skills and responsibilities mentioned in the job description. Focus on technologies like MERN stack, React, Node.js, Express, MongoDB, Tailwind CSS if mentioned.
- The LAST question (question ${numQuestions}) MUST be a BEHAVIORAL question assessing teamwork, problem-solving, handling challenges, or communication skills.
- Ensure technical questions are specific and probe understanding (e.g., "Explain how you would..." or "Describe a time when you...").
- Keep all questions clear, concise, and suitable for a real interview.
- Format the output STRICTLY as a numbered list, with each question on a new line, like this:
1. [Question 1 text]
2. [Question 2 text]
...
${numQuestions}. [Question ${numQuestions} text]
- Do NOT include any introductory or concluding text, just the numbered questions.

Generate the questions now:`;

    const generatedText = await retryWithBackoff(async () => {
      const model = getTextGenerationModel({
        temperature: 0.8, // Slightly higher for creativity in questions
        maxOutputTokens: 2048, // Increased token limit
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Check for empty response and log reason
      if (!text || text.trim().length === 0) {
        const finishReason = response?.candidates?.[0]?.finishReason;
        const safetyRatings = response?.promptFeedback?.safetyRatings;
        console.error('❌ AI returned an empty response when generating questions.');
        console.error('Finish Reason:', finishReason);
        console.error('Safety Ratings:', JSON.stringify(safetyRatings, null, 2));
         if (finishReason === 'SAFETY') {
             throw new Error('Content blocked by safety filters. Try modifying the job description text.');
         } else if (finishReason === 'MAX_TOKENS') {
             throw new Error(`AI response exceeded maximum length (${model.generationConfig.maxOutputTokens} tokens). Try requesting fewer questions or ensure the JD text is concise.`);
         }
        throw new Error('Empty response received from AI model when generating questions');
      }

      // Basic validation if response contains numbered questions format
      const lines = text.trim().split('\n');
      const numberedQuestionRegex = /^\d+\.\s+.+/;
      if (lines.length < numQuestions || !lines.every(line => numberedQuestionRegex.test(line.trim()))) {
        console.warn('Response format might be incorrect. Expected numbered list:', text.substring(0, 200));
        // Decide if you want to throw an error or attempt to use the potentially malformed text
        // For now, we'll return it and let the controller handle parsing.
      }

      return text.trim();
    });

    return generatedText;

  } catch (error) {
    console.error('Error in generateInterviewQuestions function:', error);

    // Re-throw with user-friendly messages based on caught error type/status
    const status = error?.status || error?.response?.status;
    if (status === 503 || error.message?.includes('overloaded')) {
      throw new Error('AI service is temporarily overloaded. Please try again in a moment.');
    } else if (status === 429 || error.message?.includes('rate limit')) {
      throw new Error('Rate limit reached. Please wait a minute and try again.');
    } else if (status === 404) {
      throw new Error('AI model not found. Please check API configuration.');
    } else if (status === 400 || error.message?.includes('Invalid request')) {
       // Gemini often uses 400 for safety blocks as well
       if (error.message.includes('safety') || error.message.includes('blocked')) {
            throw new Error('Content blocked by safety filters. Please review the job description text.');
       }
      throw new Error('Invalid request sent to AI service. Please check the job description content.');
    } else if (error.message?.includes('quota')) {
      throw new Error('API quota exceeded. Please check your Gemini API usage limits.');
    } else {
      // Use the message from the specific error thrown (e.g., 'Empty response...', 'Content blocked...')
      throw new Error(`Unable to generate questions: ${error.message}`);
    }
  }
};

/**
 * Evaluate ALL answers provided by the candidate against the questions and resume context.
 */
exports.evaluateAllAnswers = async (questionsAndAnswers, resumeContext) => {
  try {
    // Input validation
    if (!Array.isArray(questionsAndAnswers) || questionsAndAnswers.length === 0) {
      throw new Error('Must provide a non-empty array of questions and answers for evaluation');
    }
    questionsAndAnswers.forEach((qa, idx) => {
        if (!qa || typeof qa.question !== 'string' || typeof qa.answer !== 'string') {
            throw new Error(`Invalid format for question/answer pair at index ${idx}. Expected {question: string, answer: string}`);
        }
    });

    if (!resumeContext || typeof resumeContext !== 'string' || resumeContext.trim().length === 0) {
      console.warn('No resume context provided for evaluation, using placeholder.');
      resumeContext = 'No resume context was available for this evaluation.';
    }

    // Format Q&A pairs for the prompt
    const qaText = questionsAndAnswers.map((qa, idx) =>
      `Question ${idx + 1}: ${qa.question}\nCandidate's Answer: ${qa.answer}`
    ).join('\n\n');

    // Construct the evaluation prompt
    const prompt = `You are an expert interview evaluator specializing in software engineering roles (MERN stack). Evaluate the candidate's responses to ALL interview questions below with DETAILED SCORING based on relevance, correctness, and overall quality, considering the provided resume context.

Interview Questions and Answers:
${qaText}

Relevant Context from Candidate's Resume (use this to gauge experience claims):
${resumeContext}

Evaluation Task:
For EACH question, provide the following on separate lines:
1.  **Relevance Score** (1-10): How directly and completely does the answer address the specific question asked? (1=Off-topic, 10=Perfectly relevant)
2.  **Correctness Score** (1-10): How technically accurate, logically sound, and factually correct is the answer? Consider best practices for MERN stack development. (1=Incorrect, 10=Flawless)
3.  **Overall Score** (1-10): Your combined assessment of the answer's quality, considering clarity, depth, examples, and relevance to the resume context. (1=Poor, 10=Excellent)
4.  **Feedback** (Max 100 words): Constructive feedback that includes:
    * Specific strengths observed in the answer.
    * Clear areas for improvement with actionable suggestions.
    * Comment on how well the answer aligns with or utilizes experience mentioned in the resume context, if applicable.

Format your response EXACTLY like this template for EACH question, ensuring all labels and score formats are precise:

Question 1:
Relevance: [number]/10
Correctness: [number]/10
Overall: [number]/10
Feedback: [Your detailed feedback for Question 1, max 100 words]

Question 2:
Relevance: [number]/10
Correctness: [number]/10
Overall: [number]/10
Feedback: [Your detailed feedback for Question 2, max 100 words]

[...continue this format for all ${questionsAndAnswers.length} questions...]

Begin evaluation now:`;

    // Call the AI model with retry logic
    const evaluationText = await retryWithBackoff(async () => {
      const model = getTextGenerationModel({
        temperature: 0.5, // Lower temperature for more consistent evaluation
        maxOutputTokens: 2048, // Generous limit for potentially long feedback
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Check for empty response and log reason
      if (!text || text.trim().length === 0) {
        const finishReason = response?.candidates?.[0]?.finishReason;
        const safetyRatings = response?.promptFeedback?.safetyRatings;
        console.error('❌ AI returned an empty evaluation response.');
        console.error('Finish Reason:', finishReason);
        console.error('Safety Ratings:', JSON.stringify(safetyRatings, null, 2));
         if (finishReason === 'SAFETY') {
             throw new Error('Evaluation response blocked due to safety filters.');
         } else if (finishReason === 'MAX_TOKENS') {
             throw new Error('Evaluation response exceeded maximum length.');
         }
        throw new Error('Empty evaluation response received from AI model');
      }

      return text;
    });

    // --- Robust Parsing Logic ---
    const evaluations = [];
    // Split by "Question X:" ignoring case and allowing optional space after colon
    const questionBlocks = evaluationText.split(/Question\s+\d+:/i).filter(block => block.trim());

    if (questionBlocks.length === 0) {
        console.error('Could not parse any question blocks from evaluation response:', evaluationText.substring(0, 300));
        throw new Error('Failed to parse evaluation response format. Unexpected AI output.');
    }

    for (let i = 0; i < questionBlocks.length; i++) {
        const block = questionBlocks[i].trim(); // Trim each block

        // Regex: Optional whitespace, label, colon, optional whitespace, digits, optional /10
        const relevanceMatch = block.match(/Relevance:\s*(\d+)(?:\s*\/10)?/i);
        const correctnessMatch = block.match(/Correctness:\s*(\d+)(?:\s*\/10)?/i);
        const overallMatch = block.match(/Overall:\s*(\d+)(?:\s*\/10)?/i);
        // Regex: Feedback label, colon, optional whitespace, capture everything after (non-greedy)
        // until the end of the block (using [\s\S]*?)
        const feedbackMatch = block.match(/Feedback:\s*([\s\S]*)/i);

        // Parse scores with defaults and radix
        let relevanceScore = relevanceMatch ? parseInt(relevanceMatch[1], 10) : 5;
        let correctnessScore = correctnessMatch ? parseInt(correctnessMatch[1], 10) : 5;
        // Calculate overall if missing from regex match
        let overallScore = overallMatch ? parseInt(overallMatch[1], 10) : Math.round((relevanceScore + correctnessScore) / 2);

        // Extract feedback, provide a more informative default if missing
        const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'Feedback could not be parsed. Please check the raw AI response if needed.';

        // Clamp scores to the valid 1-10 range AFTER parsing
        relevanceScore = Math.max(1, Math.min(10, relevanceScore || 1)); // Default to 1 if NaN
        correctnessScore = Math.max(1, Math.min(10, correctnessScore || 1));
        overallScore = Math.max(1, Math.min(10, overallScore || 1));

        evaluations.push({
            score: overallScore,
            relevanceScore,
            correctnessScore,
            feedback
        });
    }

    // Ensure the number of evaluations matches the number of Q&A pairs
    // Pad with default if AI returned fewer blocks than expected
    while (evaluations.length < questionsAndAnswers.length) {
        console.warn(`Padding evaluation ${evaluations.length + 1} as it was missing in AI response.`);
        evaluations.push({
            score: 1, // Default to lowest score if missing
            relevanceScore: 1,
            correctnessScore: 1,
            feedback: 'Evaluation for this question was missing in the AI response.'
        });
    }

    // Trim extra evaluations if AI returned more blocks than expected
    if (evaluations.length > questionsAndAnswers.length) {
        console.warn(`AI returned ${evaluations.length} evaluations, but only ${questionsAndAnswers.length} questions were provided. Trimming extra evaluations.`);
        evaluations.length = questionsAndAnswers.length;
    }

    return evaluations; // Return the parsed and validated evaluations array

  } catch (error) {
    console.error('Error in evaluateAllAnswers function:', error);
    // Return default evaluations if the entire process fails
    console.log('Returning fallback evaluations due to critical error during evaluation.');
    return questionsAndAnswers.map((qa, index) => ({
      score: 1, // Default to lowest score on complete failure
      relevanceScore: 1,
      correctnessScore: 1,
      feedback: `A critical error occurred during evaluation: ${error.message}. Unable to provide feedback for question ${index + 1}.`
    }));
  }
};

/**
 * Calculate cosine similarity between two vectors, with validation.
 */
exports.cosineSimilarity = (vecA, vecB) => {
   // Validate inputs are arrays
   if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
      console.error('Cosine similarity requires array inputs. Received:', typeof vecA, typeof vecB);
      // Depending on strictness, either return 0 or throw
      // throw new Error('Invalid vectors: arguments must be arrays.');
      return 0;
   }

   // Validate arrays are not empty and have the same length
  if (vecA.length === 0 || vecA.length !== vecB.length) {
    console.error(`Vector length mismatch or empty vector: A=${vecA.length}, B=${vecB.length}`);
    // Throwing is often better here to catch upstream issues
    throw new Error(`Invalid vectors for similarity calculation: lengths differ or vector is empty (A: ${vecA.length}, B: ${vecB.length})`);
  }

  // Validate array elements are numbers
  if (!vecA.every(n => typeof n === 'number') || !vecB.every(n => typeof n === 'number')) {
      console.error('Vectors contain non-numeric elements.');
      throw new Error('Invalid vectors: elements must be numbers.');
  }


  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

  // Check for zero magnitude vectors
  if (magnitudeA === 0 || magnitudeB === 0) {
    // If vectors are [0, 0, ...] vs [0, 0, ...], similarity is arguably 1 or undefined.
    // If one is [0,0,..] and the other isn't, similarity is 0.
    // Returning 0 is a common and safe practice.
    return 0;
  }

  const similarity = dotProduct / (magnitudeA * magnitudeB);

   // Clamp similarity result to [-1, 1] to account for potential floating-point inaccuracies
   return Math.max(-1, Math.min(1, similarity));
};


/**
 * Find the top K most similar chunks from a list based on cosine similarity to a query embedding.
 */
exports.findSimilarChunks = (queryEmbedding, chunks, topK = 3) => {
  // Validate inputs
  if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      console.warn('Invalid query embedding provided for findSimilarChunks.');
      return [];
  }
  if (!Array.isArray(chunks) || chunks.length === 0) {
    console.warn('No chunks provided or invalid format for findSimilarChunks.');
    return [];
  }
  if (typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1) {
      console.warn(`Invalid topK value (${topK}), defaulting to 3.`);
      topK = 3;
  }


  try {
    const similarities = chunks
      .map((chunk, index) => {
          // Validate individual chunk structure
          if (!chunk || typeof chunk !== 'object' || !chunk.embedding || !Array.isArray(chunk.embedding)) {
              console.warn(`Skipping chunk at index ${index} due to missing or invalid structure/embedding.`);
              return null; // Mark invalid chunk
          }
          try {
            // Calculate similarity, handle potential errors from cosineSimilarity
            const similarityScore = exports.cosineSimilarity(queryEmbedding, chunk.embedding);
            return {
              index, // Original index in the input array
              chunk, // The chunk object itself { text, embedding }
              similarity: similarityScore
            };
          } catch (similarityError) {
             console.error(`Error calculating similarity for chunk index ${index}:`, similarityError.message);
             return null; // Mark chunk as invalid if similarity calculation fails
          }
      })
      // Filter out invalid chunks (nulls) and any potential NaN similarity scores
      .filter(item => item !== null && typeof item.similarity === 'number' && !isNaN(item.similarity));

    // Sort by similarity score in descending order
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      // Return the top K results
      .slice(0, topK);

  } catch (error) {
    // Catch any unexpected errors during the mapping/sorting process
    console.error('Unexpected error in findSimilarChunks:', error);
    return []; // Return empty array on failure
  }
};

