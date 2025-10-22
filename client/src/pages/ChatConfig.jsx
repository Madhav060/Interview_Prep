import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import api from '../utils/axios';

const ChatConfig = () => {
  const [step, setStep] = useState(1); // 1: Config, 2: Upload, 3: Generating
  const [numQuestions, setNumQuestions] = useState(3);
  const [sessionName, setSessionName] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState({ resume: null, jd: null });
  const [uploading, setUploading] = useState({ resume: false, jd: false });
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();

  const handleCreateSession = async () => {
    try {
      const response = await api.post('/chat/create-session', {
        numQuestions,
        sessionName: sessionName || `Interview Session - ${new Date().toLocaleString()}`,
      });

      if (response.data.success) {
        setSessionId(response.data.sessionId);
        setStep(2);
        toast.success('Session created! Now upload your documents.');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error creating session');
    }
  };

  const handleUploadDocument = async (file, type) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }

    setUploading({ ...uploading, [type]: true });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    formData.append('sessionId', sessionId);

    try {
      const response = await api.post('/documents/upload-for-session', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        setUploadedDocs({ ...uploadedDocs, [type]: response.data.document });
        toast.success(`${type === 'resume' ? 'Resume' : 'Job Description'} uploaded!`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Upload failed');
    } finally {
      setUploading({ ...uploading, [type]: false });
    }
  };

  const handleGenerateQuestions = async () => {
    setGenerating(true);
    setStep(3);

    try {
      const response = await api.post(`/chat/generate-questions/${sessionId}`);
      
      if (response.data.success) {
        toast.success('Questions generated! Starting interview...');
        setTimeout(() => {
          navigate(`/chat/${sessionId}`);
        }, 1000);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error generating questions');
      setStep(2);
    } finally {
      setGenerating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const canGenerateQuestions = uploadedDocs.resume && uploadedDocs.jd;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => step === 1 ? navigate('/upload') : setStep(step - 1)}
              className="text-gray-600 hover:text-gray-900"
              disabled={step === 3}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">New Interview Session</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4">
            <StepIndicator number={1} active={step === 1} completed={step > 1} label="Configure" />
            <div className={`h-1 w-16 ${step > 1 ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
            <StepIndicator number={2} active={step === 2} completed={step > 2} label="Upload Docs" />
            <div className={`h-1 w-16 ${step > 2 ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
            <StepIndicator number={3} active={step === 3} completed={false} label="Generate" />
          </div>
        </div>

        {/* Step 1: Configuration */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Configure Your Interview
            </h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Session Name (Optional)
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={`Interview - ${new Date().toLocaleDateString()}`}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Number of Questions: <span className="text-2xl font-bold text-indigo-600">{numQuestions}</span>
              </label>
              <input
                type="range"
                min="2"
                max="10"
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>2</span>
                <span>10</span>
              </div>
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  📝 First <strong>{numQuestions - 1}</strong> question{numQuestions > 2 ? 's' : ''} will be <strong>technical/role-specific</strong>
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  🗣️ Last question will be <strong>behavioral</strong>
                </p>
              </div>
            </div>

            <button
              onClick={handleCreateSession}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              Next: Upload Documents →
            </button>
          </div>
        )}

        {/* Step 2: Upload Documents */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Upload Your Documents
              </h2>
              <p className="text-gray-600 mb-6">
                Upload the resume and job description for this interview session
              </p>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <UploadZone
                  title="Resume"
                  type="resume"
                  onUpload={(file) => handleUploadDocument(file, 'resume')}
                  uploading={uploading.resume}
                  uploaded={uploadedDocs.resume}
                />
                <UploadZone
                  title="Job Description"
                  type="jd"
                  onUpload={(file) => handleUploadDocument(file, 'jd')}
                  uploading={uploading.jd}
                  uploaded={uploadedDocs.jd}
                />
              </div>

              {canGenerateQuestions && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-green-800 font-medium">
                      Both documents uploaded! Ready to generate questions.
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleGenerateQuestions}
                disabled={!canGenerateQuestions}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {canGenerateQuestions ? 'Generate Questions & Start Interview →' : 'Upload Both Documents First'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Generating */}
        {step === 3 && (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-indigo-600 mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Generating Interview Questions...
            </h2>
            <p className="text-gray-600">
              AI is analyzing your documents and creating personalized questions
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Step Indicator Component
const StepIndicator = ({ number, active, completed, label }) => {
  return (
    <div className="flex flex-col items-center">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
        ${completed ? 'bg-indigo-600 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
        {completed ? '✓' : number}
      </div>
      <span className={`text-xs mt-1 ${active ? 'text-indigo-600 font-semibold' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
};

// Upload Zone Component
const UploadZone = ({ title, type, onUpload, uploading, uploaded }) => {
  const onDrop = (acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onUpload(acceptedFiles[0]);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploading || uploaded,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
        isDragActive
          ? 'border-indigo-500 bg-indigo-50'
          : uploaded
          ? 'border-green-300 bg-green-50'
          : 'border-gray-300 bg-white hover:border-indigo-400'
      } ${(uploading || uploaded) ? 'cursor-not-allowed opacity-75' : ''}`}
    >
      <input {...getInputProps()} />
      
      {uploading ? (
        <div className="space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-gray-600">Processing...</p>
        </div>
      ) : uploaded ? (
        <>
          <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-green-600 font-medium">✓ {uploaded.fileName}</p>
        </>
      ) : (
        <>
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-600 mb-1">
            {isDragActive ? 'Drop the PDF here' : 'Drag & drop or click to upload'}
          </p>
          <p className="text-xs text-gray-500">PDF only, max 2MB</p>
        </>
      )}
    </div>
  );
};

export default ChatConfig;