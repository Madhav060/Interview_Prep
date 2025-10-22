import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/axios';

const ChatConfig = () => {
  const [sessionName, setSessionName] = useState('');
  const [numQuestions, setNumQuestions] = useState(3);
  const [resumeFile, setResumeFile] = useState(null);
  const [jdFile, setJdFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [step, setStep] = useState(1); // 1: Config, 2: Upload, 3: Generating
  const navigate = useNavigate();

  // Step 1: Create Session
  const handleCreateSession = async (e) => {
    e.preventDefault();

    if (!sessionName.trim()) {
      toast.error('Please enter a session name');
      return;
    }

    setUploading(true);

    try {
      const response = await api.post('/chat/create-session', {
        sessionName,
        numQuestions,
      });

      if (response.data.success) {
        setSessionId(response.data.sessionId);
        setStep(2); // Move to upload step
        toast.success('Session created! Now upload your documents.');
      }
    } catch (error) {
      console.error('Create session error:', error);
      toast.error(error.response?.data?.message || 'Error creating session');
    } finally {
      setUploading(false);
    }
  };

  // Step 2: Upload Documents and Generate Questions
  const handleStartInterview = async () => {
    if (!resumeFile || !jdFile) {
      toast.error('Please upload both resume and job description');
      return;
    }

    setUploading(true);
    setStep(3); // Move to generating step

    try {
      // Upload Resume
      const resumeFormData = new FormData();
      resumeFormData.append('document', resumeFile);
      resumeFormData.append('type', 'resume');
      resumeFormData.append('sessionId', sessionId);

      console.log('📄 Uploading resume...');
      const resumeResponse = await api.post('/documents/upload', resumeFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!resumeResponse.data.success) {
        throw new Error('Resume upload failed');
      }
      console.log('✅ Resume uploaded');

      // Upload Job Description
      const jdFormData = new FormData();
      jdFormData.append('document', jdFile);
      jdFormData.append('type', 'jd');
      jdFormData.append('sessionId', sessionId);

      console.log('📄 Uploading job description...');
      const jdResponse = await api.post('/documents/upload', jdFormData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!jdResponse.data.success) {
        throw new Error('Job description upload failed');
      }
      console.log('✅ Job description uploaded');

      // Generate Questions
      console.log('🤖 Generating interview questions...');
      const questionsResponse = await api.post(`/chat/generate-questions/${sessionId}`);

      console.log('Questions Response:', questionsResponse.data);

      if (questionsResponse.data.success && questionsResponse.data.questions) {
        console.log('✅ Questions generated successfully');
        toast.success('Interview ready! 🎉');
        
        // Small delay to show success message
        setTimeout(() => {
          navigate(`/chat/${sessionId}`);
        }, 1000);
      } else {
        throw new Error('No questions generated');
      }
    } catch (error) {
      console.error('Start interview error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error starting interview');
      setStep(2); // Go back to upload step
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
    toast.success('Logged out successfully');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-lg transition"
                title="Back to dashboard"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Setup New Interview</h1>
                <p className="text-sm text-gray-500">
                  Step {step} of 3
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:text-gray-900 font-medium hover:bg-gray-100 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <StepIndicator number={1} label="Session Info" active={step === 1} completed={step > 1} />
            <div className={`flex-1 h-1 mx-4 ${step > 1 ? 'bg-indigo-600' : 'bg-gray-300'}`} />
            <StepIndicator number={2} label="Upload Files" active={step === 2} completed={step > 2} />
            <div className={`flex-1 h-1 mx-4 ${step > 2 ? 'bg-indigo-600' : 'bg-gray-300'}`} />
            <StepIndicator number={3} label="Generate" active={step === 3} completed={false} />
          </div>
        </div>

        {/* Step 1: Session Configuration */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Interview Session</h2>
              <p className="text-gray-600">Set up your practice interview configuration</p>
            </div>

            <form onSubmit={handleCreateSession} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Session Name
                </label>
                <input
                  type="text"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g., Frontend Developer Interview - Google"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Number of Questions
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="2"
                    max="10"
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <div className="w-16 text-center">
                    <span className="text-2xl font-bold text-indigo-600">{numQuestions}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {numQuestions - 1} technical + 1 behavioral question
                </p>
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-semibold text-lg hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Creating...' : 'Continue to Upload'}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Upload Documents */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Documents</h2>
              <p className="text-gray-600">Upload your resume and the job description</p>
            </div>

            <div className="space-y-6">
              {/* Resume Upload */}
              <FileUploadBox
                label="Resume"
                file={resumeFile}
                onFileChange={setResumeFile}
                accept=".pdf,.doc,.docx"
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />

              {/* Job Description Upload */}
              <FileUploadBox
                label="Job Description"
                file={jdFile}
                onFileChange={setJdFile}
                accept=".pdf,.doc,.docx,.txt"
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                }
              />

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-white text-gray-700 border-2 border-gray-300 py-4 rounded-xl font-semibold hover:border-gray-400 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleStartInterview}
                  disabled={!resumeFile || !jdFile || uploading}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-xl font-semibold hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Processing...' : 'Start Interview'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Generating Questions */}
        {step === 3 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mb-6"></div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Generating Your Interview Questions</h2>
              <p className="text-gray-600 mb-6">
                AI is analyzing your resume and job description to create personalized questions...
              </p>
              <div className="flex flex-col space-y-2 text-sm text-gray-500">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Processing documents</span>
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse animation-delay-200"></div>
                  <span>Analyzing job requirements</span>
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse animation-delay-400"></div>
                  <span>Crafting interview questions</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Step Indicator Component
const StepIndicator = ({ number, label, active, completed }) => (
  <div className="flex flex-col items-center">
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${
        completed
          ? 'bg-green-500 text-white'
          : active
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-300 text-gray-600'
      }`}
    >
      {completed ? '✓' : number}
    </div>
    <span className={`text-xs font-medium ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
      {label}
    </span>
  </div>
);

// File Upload Box Component
const FileUploadBox = ({ label, file, onFileChange, accept, icon }) => (
  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-indigo-400 transition">
    <div className="flex items-center space-x-4">
      <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {label} *
        </label>
        <input
          type="file"
          accept={accept}
          onChange={(e) => onFileChange(e.target.files[0])}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
        />
      </div>
      {file && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      )}
    </div>
    {file && (
      <div className="mt-3 text-sm text-gray-600 bg-green-50 px-4 py-2 rounded-lg">
        ✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)
      </div>
    )}
  </div>
);

export default ChatConfig;