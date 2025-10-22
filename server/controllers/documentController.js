const Document = require('../models/Document');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { extractTextFromPDF, chunkText } = require('../utils/pdfProcessor');
const { generateEmbeddings } = require('../utils/gemini'); 

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
}).single('file');

// Multer error handler middleware
exports.uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds 2MB limit',
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    next();
  });
};

// @route   POST /api/documents/upload
// @desc    Upload and process PDF document
// @access  Private
exports.uploadDocument = async (req, res) => {
  try {
    const { type } = req.body;
    
    // Validation
    if (!type || !['resume', 'jd'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Must be "resume" or "jd"',
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Check if user already has this document type
    const existingDoc = await Document.findOne({
      userId: req.user._id,
      type,
    });

    if (existingDoc) {
      // Delete old document from Cloudinary
      try {
        const publicId = existingDoc.fileUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error('Error deleting old file from Cloudinary:', err);
      }
      
      // Delete from database
      await Document.deleteOne({ _id: existingDoc._id });
    }

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'interview-prep',
          resource_type: 'raw',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Extract text from PDF
    const extractedText = await extractTextFromPDF(req.file.buffer);
    
    if (!extractedText || extractedText.trim().length < 100) {
      return res.status(400).json({
        success: false,
        message: 'Could not extract meaningful text from PDF. Please ensure the PDF contains readable text.',
      });
    }

    // Chunk the text
    const textChunks = chunkText(extractedText, 500);
    
    if (textChunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid text chunks created from PDF',
      });
    }

    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(textChunks);

    // Prepare chunks with embeddings
    const chunks = textChunks.map((text, index) => ({
      text,
      embedding: embeddings[index],
    }));

    // Save to database
    const document = await Document.create({
      userId: req.user._id,
      type,
      fileUrl: uploadResult.secure_url,
      fileName: req.file.originalname,
      chunks,
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded and processed successfully',
      document: {
        id: document._id,
        type: document.type,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        chunksCount: chunks.length,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading document',
      error: error.message,
    });
  }
};

// @route   GET /api/documents/list
// @desc    Get user's uploaded documents
// @access  Private
exports.listDocuments = async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.user._id })
      .select('-chunks') // Exclude chunks from list view
      .sort({ createdAt: -1 });

    // Check which documents are uploaded
    const hasResume = documents.some(doc => doc.type === 'resume');
    const hasJD = documents.some(doc => doc.type === 'jd');

    res.status(200).json({
      success: true,
      documents: documents.map(doc => ({
        id: doc._id,
        type: doc.type,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        createdAt: doc.createdAt,
      })),
      stats: {
        hasResume,
        hasJD,
        canStartChat: hasResume && hasJD,
      },
    });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents',
    });
  }
};

// @route   DELETE /api/documents/:id
// @desc    Delete a document
// @access  Private
exports.deleteDocument = async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
      });
    }

    // Delete from Cloudinary
    try {
      const publicId = document.fileUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch (err) {
      console.error('Error deleting from Cloudinary:', err);
    }

    // Delete from database
    await Document.deleteOne({ _id: document._id });

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting document',
    });
  }
};

// @route   GET /api/documents/check
// @desc    Check if user has uploaded required documents
// @access  Private
exports.checkDocuments = async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.user._id }).select('type');
    
    const hasResume = documents.some(doc => doc.type === 'resume');
    const hasJD = documents.some(doc => doc.type === 'jd');

    res.status(200).json({
      success: true,
      hasResume,
      hasJD,
      canStartChat: hasResume && hasJD,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking documents',
    });
  }
};


exports.uploadForSession = async (req, res) => {
  try {
    const { type, sessionId } = req.body;
    
    // Validation
    if (!type || !['resume', 'jd'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Must be "resume" or "jd"',
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required',
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Check if session exists and belongs to user
    const Chat = require('../models/Chat');
    const session = await Chat.findOne({ _id: sessionId, userId: req.user._id });
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    // Check if this document type already uploaded for this session
    const existingDoc = await Document.findOne({
      userId: req.user._id,
      sessionId,
      type,
    });

    if (existingDoc) {
      // Delete old document from Cloudinary
      try {
        const publicId = existingDoc.fileUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      } catch (err) {
        console.error('Error deleting old file from Cloudinary:', err);
      }
      
      // Delete from database
      await Document.deleteOne({ _id: existingDoc._id });
    }

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `interview-prep/${sessionId}`,
          resource_type: 'raw',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Extract text from PDF
    const extractedText = await extractTextFromPDF(req.file.buffer);
    
    if (!extractedText || extractedText.trim().length < 100) {
      return res.status(400).json({
        success: false,
        message: 'Could not extract meaningful text from PDF. Please ensure the PDF contains readable text.',
      });
    }

    // Chunk the text
    const textChunks = chunkText(extractedText, 500);
    
    if (textChunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid text chunks created from PDF',
      });
    }

    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(textChunks);

    // Prepare chunks with embeddings
    const chunks = textChunks.map((text, index) => ({
      text,
      embedding: embeddings[index],
    }));

    // Save to database with sessionId
    const document = await Document.create({
      userId: req.user._id,
      sessionId,
      type,
      fileUrl: uploadResult.secure_url,
      fileName: req.file.originalname,
      chunks,
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded and processed successfully',
      document: {
        id: document._id,
        type: document.type,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        chunksCount: chunks.length,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading document',
      error: error.message,
    });
  }
};

// @route   GET /api/documents/session/:sessionId
// @desc    Get documents for a specific session
// @access  Private
exports.getSessionDocuments = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const documents = await Document.find({
      userId: req.user._id,
      sessionId,
    }).select('-chunks');

    const hasResume = documents.some(doc => doc.type === 'resume');
    const hasJD = documents.some(doc => doc.type === 'jd');

    res.status(200).json({
      success: true,
      documents: documents.map(doc => ({
        id: doc._id,
        type: doc.type,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        createdAt: doc.createdAt,
      })),
      stats: {
        hasResume,
        hasJD,
        canGenerateQuestions: hasResume && hasJD,
      },
    });
  } catch (error) {
    console.error('Get session documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents',
    });
  }
};

