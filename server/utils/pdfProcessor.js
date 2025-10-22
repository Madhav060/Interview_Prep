const pdfParse = require('pdf-parse');

/**
 * Extract text from PDF buffer
 */
exports.extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
};

/**
 * Chunk text into smaller pieces (~500 words each)
 */
exports.chunkText = (text, wordsPerChunk = 500) => {
  // Clean text: remove excessive whitespace and newlines
  const cleanedText = text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
  
  // Split by words
  const words = cleanedText.split(' ');
  const chunks = [];
  
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    if (chunk.trim().length > 50) { // Only add chunks with meaningful content
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
};