const Document = require('../models/Document');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { extractTextFromPDF, chunkText } = require('../utils/pdfProcessor');
const { generateEmbeddings } = require('../utils/gemini');
const mongoose = require('mongoose'); // Import mongoose

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

// Accept both 'file' and 'document' field names (frontend uses both in different places)
const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'document', maxCount: 1 },
]);

// Multer error handler middleware
exports.uploadMiddleware = (req, res, next) => {
  uploadFields(req, res, (err) => {
    // Normalize multer file objects: prefer single file on req.file
    // Ensure req.file exists if either 'file' or 'document' was uploaded
    if (!req.file && req.files) {
      if (req.files.file && req.files.file[0]) {
        req.file = req.files.file[0];
      } else if (req.files.document && req.files.document[0]) {
        req.file = req.files.document[0];
      }
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds 2MB limit',
        });
      }
      // Handle other multer errors (e.g., unexpected field)
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`,
      });
    } else if (err) {
      // Handle non-multer errors (like fileFilter rejection)
      return res.status(400).json({
        success: false,
        message: err.message || 'Invalid file type',
      });
    }

    // If no file was processed by multer (e.g., wrong field name and not handled above)
    if (!req.file) {
       // Check if body might contain fields but no file was actually sent
       if (req.body && Object.keys(req.body).length > 0 && (!req.files || Object.keys(req.files).length === 0)) {
           return res.status(400).json({ success: false, message: 'No file was uploaded. Please ensure you are sending a file with the name "document" or "file".' });
       }
       // If it genuinely seems like no file attempt was made, just continue,
       // the main controller logic will catch the missing req.file.
    }

    next();
  });
};


// @route   POST /api/documents/upload
// @desc    Upload and process PDF document (Handles both global and session-specific)
// @access  Private
exports.uploadDocument = async (req, res) => {
  try {
    // --- MODIFIED: Read sessionId from body ---
    const { type, sessionId } = req.body;
    const userId = req.user?._id;

    // --- Enhanced Validation ---
    if (!userId) {
       return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!type || !['resume', 'jd'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type in request body. Must be "resume" or "jd"',
      });
    }
     // Validate sessionId if provided
     if (sessionId && !mongoose.Types.ObjectId.isValid(sessionId)) {
         return res.status(400).json({ success: false, message: 'Invalid Session ID format provided' });
     }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or incorrect field name used. Use "file" or "document".',
      });
    }
    // --- End Enhanced Validation ---


    console.log(`⬆️ Uploading document: Type=${type}, SessionId=${sessionId || 'N/A'}, User=${userId}, File=${req.file.originalname}`);

     // --- MODIFIED: Query based on sessionId presence ---
     const query = { userId: userId, type: type };
     if (sessionId) {
         query.sessionId = sessionId;
     } else {
         // If uploading without a session ID, target the "global" document for that user/type.
         // In Mongoose, querying for a field that is explicitly `null` or doesn't exist are slightly different.
         // Let's target documents where sessionId is explicitly null OR where it doesn't exist yet.
         // However, since your schema defaults sessionId to null, just querying for null is sufficient.
         query.sessionId = null;
     }

    // Check if user already has this document type *for this context (session or global)*
    const existingDoc = await Document.findOne(query);

    if (existingDoc) {
        console.log(`Existing document found (ID: ${existingDoc._id}), replacing...`);
      // Delete old document from Cloudinary
      try {
          // Extract public_id carefully, handling potential URL variations
          const urlParts = existingDoc.fileUrl.split('/');
          const publicIdWithExtension = urlParts.slice(urlParts.indexOf('interview-prep')).join('/'); // Get path after 'interview-prep'
          const publicId = publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.')); // Remove extension
          if (publicId) {
             console.log(`Deleting old file from Cloudinary: ${publicId}`);
             await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
          } else {
             console.warn(`Could not extract publicId from URL: ${existingDoc.fileUrl}`);
          }
      } catch (err) {
        // Log error but don't fail the upload if Cloudinary deletion fails
        console.error('Error deleting old file from Cloudinary (continuing upload):', err);
      }

      // Delete from database
      await Document.deleteOne({ _id: existingDoc._id });
      console.log(`Deleted existing document from DB: ${existingDoc._id}`);
    }

    // --- MODIFIED: Set Cloudinary folder based on sessionId ---
    const cloudinaryFolder = sessionId ? `interview-prep/${sessionId}` : 'interview-prep/global'; // Separate global docs

    // Upload to Cloudinary
    console.log(`Uploading to Cloudinary folder: ${cloudinaryFolder}`);
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: cloudinaryFolder,
          resource_type: 'raw', // Keep as raw since it's PDF, not image/video
          // public_id: `${type}-${userId}-${Date.now()}` // Optional: Define a specific public_id
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return reject(new Error(`Cloudinary upload failed: ${error.message}`));
          }
          if (!result || !result.secure_url) {
             console.error('Cloudinary upload incomplete response:', result);
             return reject(new Error('Cloudinary upload failed: No secure_url returned.'));
          }
          resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });
    console.log(`☁️ Cloudinary upload successful: ${uploadResult.public_id}`);


    // Extract text from PDF
    console.log('📄 Extracting text from PDF...');
    const extractedText = await extractTextFromPDF(req.file.buffer);

    // Add stricter check for meaningful text length
    if (!extractedText || extractedText.trim().length < 50) { // Increased minimum length
       console.warn(`Extracted text too short or empty (${extractedText?.trim().length || 0} chars)`);
       // Optionally delete the just-uploaded Cloudinary file if extraction fails badly
        try { await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: 'raw' }); } catch (e) { console.error("Failed to clean up Cloudinary file after text extraction failure", e); }
      return res.status(400).json({
        success: false,
        message: 'Could not extract sufficient text from PDF. Please ensure the PDF contains selectable text and is not just an image.',
      });
    }
    console.log(`✍️ Extracted text length: ${extractedText.length}`);


    // Chunk the text
    const textChunks = chunkText(extractedText, 500); // Using 500 words per chunk

    if (!textChunks || textChunks.length === 0) {
       console.error('Failed to create text chunks from extracted text.');
       // Optionally delete the just-uploaded Cloudinary file
       try { await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: 'raw' }); } catch (e) { console.error("Failed to clean up Cloudinary file after chunking failure", e); }
      return res.status(400).json({
        success: false,
        message: 'Text extracted, but failed to divide into valid chunks.',
      });
    }
    console.log(`🧩 Created ${textChunks.length} text chunks.`);


    // Generate embeddings for all chunks
    console.log('🧠 Generating embeddings for chunks...');
    const embeddings = await generateEmbeddings(textChunks); // Assumes generateEmbeddings handles errors internally
    console.log(`✨ Generated ${embeddings.length} embeddings.`);

     // Validate embedding results
     if (!embeddings || embeddings.length !== textChunks.length) {
         console.error(`Embedding count mismatch: ${embeddings?.length || 0} embeddings for ${textChunks.length} chunks.`);
          // Optionally delete the just-uploaded Cloudinary file
         try { await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: 'raw' }); } catch (e) { console.error("Failed to clean up Cloudinary file after embedding failure", e); }
         return res.status(500).json({ success: false, message: 'Error generating embeddings for all text chunks.' });
     }
     if (embeddings.some(e => !Array.isArray(e) || e.length === 0)) {
          console.error(`Some generated embeddings are invalid.`);
           // Optionally delete the just-uploaded Cloudinary file
         try { await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: 'raw' }); } catch (e) { console.error("Failed to clean up Cloudinary file after embedding validation failure", e); }
         return res.status(500).json({ success: false, message: 'Invalid embeddings generated.' });
     }


    // Prepare chunks with embeddings for saving
    const chunksWithEmbeddings = textChunks.map((text, index) => ({
      text,
      // Ensure embedding exists for the index, handle potential errors from generateEmbeddings if it returned nulls/placeholders
      embedding: embeddings[index] || [], // Use empty array as fallback? Or fail? Let's assume generateEmbeddings returns valid arrays or throws
    }));

    // --- MODIFIED: Save with sessionId if present, otherwise null ---
    const documentData = {
      userId: userId,
      sessionId: sessionId || null, // Save null if sessionId is not provided
      type,
      fileUrl: uploadResult.secure_url,
      fileName: req.file.originalname,
      chunks: chunksWithEmbeddings,
    };

    console.log(`💾 Saving document to database (Session: ${documentData.sessionId})...`);
    const document = await Document.create(documentData);
    console.log(`✅ Document saved successfully: ${document._id}`);

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Document uploaded and processed successfully',
      document: { // Send back relevant info
        id: document._id,
        type: document.type,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        chunksCount: document.chunks.length,
        createdAt: document.createdAt,
        sessionId: document.sessionId // Include sessionId in response
      },
    });
  } catch (error) {
    // Catch all errors (Cloudinary, PDFParse, Gemini, DB)
    console.error('❌ Upload process failed:', error);
    // Try to provide a more specific message if possible
    let userMessage = 'Error uploading document. Please try again.';
    if (error.message.includes('extract text')) {
        userMessage = 'Failed to read text from the uploaded PDF. Please ensure it contains selectable text.';
    } else if (error.message.includes('embedding')) {
        userMessage = 'Failed to process document content with AI. Please try again later.';
    } else if (error.message.includes('Cloudinary')) {
        userMessage = 'Failed to save the uploaded file. Please try again.';
    }

    res.status(500).json({
      success: false,
      message: userMessage,
      // Only send detailed error in development
      // error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// @route   GET /api/documents/list
// @desc    Get user's uploaded "global" documents (sessionId is null)
// @access  Private
exports.listDocuments = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Find documents where sessionId is null for this user
    const documents = await Document.find({ userId: userId, sessionId: null })
      .select('-chunks -chunks.embedding') // Exclude chunks and embeddings
      .sort({ createdAt: -1 });

    // Check which global documents exist
    const hasResume = documents.some(doc => doc.type === 'resume');
    const hasJD = documents.some(doc => doc.type === 'jd');

    res.status(200).json({
      success: true,
      // Map to client-friendly format
      documents: documents.map(doc => ({
        id: doc._id,
        type: doc.type,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        createdAt: doc.createdAt,
      })),
      // Stats specifically for global documents
      stats: {
        hasResume,
        hasJD,
        // canStartChat depends on having *both* global docs, adjust if logic differs
        canStartChat: hasResume && hasJD,
      },
    });
  } catch (error) {
    console.error('List global documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching global documents',
    });
  }
};

// @route   DELETE /api/documents/:id
// @desc    Delete a document (can be global or session-specific)
// @access  Private
exports.deleteDocument = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { id: documentId } = req.params;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
        return res.status(400).json({ success: false, message: 'Invalid Document ID' });
    }

    console.log(`🗑️ Attempting to delete document: ${documentId} for user: ${userId}`);

    // Find the document and ensure the user owns it before deleting
    const document = await Document.findOneAndDelete({
      _id: documentId,
      userId: userId, // User must own the document
    });

    if (!document) {
      console.warn(`Delete document: Document not found or access denied for ${documentId}`);
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied',
      });
    }

    // Delete associated file from Cloudinary
    try {
      // Extract public_id carefully
      const urlParts = document.fileUrl.split('/');
      const publicIdWithExtension = urlParts.slice(urlParts.indexOf('interview-prep')).join('/');
      const publicId = publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'));

      if (publicId) {
        console.log(`Deleting file from Cloudinary: ${publicId}`);
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      } else {
        console.warn(`Could not extract publicId from URL for deletion: ${document.fileUrl}`);
      }
    } catch (cloudinaryError) {
      // Log error but don't fail the request if only Cloudinary deletion fails
      console.error(`Error deleting file from Cloudinary (DB entry deleted): ${cloudinaryError.message}`);
    }

    console.log(`✅ Document deleted successfully from DB: ${documentId}`);
    res.status(200).json({
      success: true,
      message: `Document '${document.fileName}' deleted successfully`,
    });
  } catch (error) {
    console.error(`Delete document error for ID ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error deleting document',
    });
  }
};


// @route   GET /api/documents/check
// @desc    Check if user has uploaded required GLOBAL documents
// @access  Private
exports.checkDocuments = async (req, res) => {
  try {
    const userId = req.user?._id;
     if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Check specifically for GLOBAL documents (sessionId: null)
    const documents = await Document.find({ userId: userId, sessionId: null }).select('type');

    const hasResume = documents.some(doc => doc.type === 'resume');
    const hasJD = documents.some(doc => doc.type === 'jd');

    res.status(200).json({
      success: true,
      hasResume,
      hasJD,
      // This specifically reflects if a chat can be started using GLOBAL docs
      canStartChat: hasResume && hasJD,
    });
  } catch (error) {
     console.error('Check documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking global documents status',
    });
  }
};


// @route   GET /api/documents/session/:sessionId
// @desc    Get documents specifically for a given session
// @access  Private
exports.getSessionDocuments = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?._id;

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({ success: false, message: 'Invalid Session ID' });
    }

    // Find documents specifically for this user and session
    const documents = await Document.find({
      userId: userId,
      sessionId: sessionId,
    }).select('-chunks -chunks.embedding'); // Exclude chunks and embeddings

    const hasResume = documents.some(doc => doc.type === 'resume');
    const hasJD = documents.some(doc => doc.type === 'jd');

    res.status(200).json({
      success: true,
      // Map documents to client format
      documents: documents.map(doc => ({
        id: doc._id,
        type: doc.type,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        createdAt: doc.createdAt,
      })),
      // Stats for *this specific session*
      stats: {
        hasResume,
        hasJD,
        canGenerateQuestions: hasResume && hasJD, // Can questions be generated for *this* session?
      },
    });
  } catch (error) {
    console.error(`Get session documents error for session ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error fetching session documents',
    });
  }
};

// --- uploadForSession is technically redundant if uploadDocument handles sessionId ---
// --- Keeping it here for reference or if you decide to use the separate route ---
// @route   POST /api/documents/upload-for-session (UNUSED if frontend calls /upload)
// @desc    Upload document specifically for a session
// @access  Private
exports.uploadForSession = async (req, res) => {
   // This function is largely identical to the modified uploadDocument
   // If you keep it, ensure it's called by the correct route and frontend request
   // For simplicity, it's recommended to use the single modified uploadDocument handler
   console.warn("uploadForSession called - consider merging logic into uploadDocument");
   // Re-use the logic from uploadDocument, ensuring sessionId is handled
   await exports.uploadDocument(req, res); // Delegate to the main handler
};
