import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import api from '../utils/axios';

const Upload = () => {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState({ resume: false, jd: false });
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ hasResume: false, hasJD: false, canStartChat: false });
  const navigate = useNavigate();

  // Fetch documents on mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await api.get('/documents/list');
      if (response.data.success) {
        setDocuments(response.data.documents);
        setStats(response.data.stats);
      }
    } catch (error) {
      toast.error('Error fetching documents');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file, type) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }

    setUploading({ ...uploading, [type]: true });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
      const response = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        toast.success(`${type === 'resume' ? 'Resume' : 'Job Description'} uploaded successfully!`);
        fetchDocuments();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Upload failed');
    } finally {
      setUploading({ ...uploading, [type]: false });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      const response = await api.delete(`/documents/${id}`);
      if (response.data.success) {
        toast.success('Document deleted successfully');
        fetchDocuments();
      }
    } catch (error) {
      toast.error('Error deleting document');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">AI Interview Prep</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Status Banner */}
        {stats.canStartChat && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex justify-between items-center">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-800 font-medium">
              Both documents uploaded! You're ready to start practicing.
            </span>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => navigate('/sessions')}
              className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-semibold hover:bg-gray-50 transition border border-indigo-600"
            >
              View Sessions
            </button>
            <button
              onClick={() => navigate('/chat-config')}
              className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              Start New Interview →
            </button>
          </div>
        </div>
      )}

        <h2 className="text-3xl font-bold text-gray-900 mb-2">Upload Documents</h2>
        <p className="text-gray-600 mb-8">
          Upload your resume and the job description to start practicing with AI
        </p>

        {/* Upload Zones */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <DropZone
            title="Resume"
            type="resume"
            onUpload={handleUpload}
            uploading={uploading.resume}
            hasDocument={stats.hasResume}
          />
          <DropZone
            title="Job Description"
            type="jd"
            onUpload={handleUpload}
            uploading={uploading.jd}
            hasDocument={stats.hasJD}
          />
        </div>

        {/* Documents List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Uploaded Documents</h3>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
          ) : documents.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No documents uploaded yet</p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <DocumentCard key={doc.id} document={doc} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// DropZone Component
const DropZone = ({ title, type, onUpload, uploading, hasDocument }) => {
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onUpload(acceptedFiles[0], type);
    }
  }, [onUpload, type]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
        isDragActive
          ? 'border-indigo-500 bg-indigo-50'
          : hasDocument
          ? 'border-green-300 bg-green-50'
          : 'border-gray-300 bg-white hover:border-indigo-400'
      } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      
      {uploading ? (
        <div className="space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-gray-600">Processing {title}...</p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            {hasDocument ? (
              <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-16 h-16 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            )}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 mb-2">
            {isDragActive ? 'Drop the PDF here' : 'Drag & drop PDF here, or click to select'}
          </p>
          <p className="text-sm text-gray-500">Max size: 2MB</p>
          {hasDocument && (
            <p className="text-sm text-green-600 font-medium mt-2">✓ Uploaded</p>
          )}
        </>
      )}
    </div>
  );
};

// DocumentCard Component
const DocumentCard = ({ document, onDelete }) => {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
      <div className="flex items-center space-x-4">
        <div className="bg-indigo-100 p-3 rounded-lg">
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-gray-900">{document.fileName}</p>
          <p className="text-sm text-gray-500">
            {document.type === 'resume' ? 'Resume' : 'Job Description'} • {new Date(document.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <button
        onClick={() => onDelete(document.id)}
        className="text-red-600 hover:text-red-800 p-2"
        title="Delete document"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
};

export default Upload;