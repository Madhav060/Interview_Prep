import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/axios';

const Landing = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (token) {
      fetchSessions();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchSessions = async () => {
    try {
      const response = await api.get('/chat/sessions');
      if (response.data.success) {
        setSessions(response.data.sessions);
      }
    } catch (error) {
      console.error('Error fetching sessions');
      // Consider adding a user-facing error message here
      // toast.error('Could not load sessions.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.reload(); // Reload to reflect logged-out state
    toast.success('Logged out successfully');
  };

  const handleDelete = async (id) => {
    // Basic confirmation dialog (Consider a custom modal for better UX)
    if (!window.confirm('Are you sure you want to delete this session?')) {
      return;
    }

    try {
      const response = await api.delete(`/chat/session/${id}`);
      if (response.data.success) {
        toast.success('Session deleted');
        fetchSessions(); // Refresh the list
      } else {
         // Handle potential server-side failure messages
         toast.error(response.data.message || 'Error deleting session');
      }
    } catch (error) {
       console.error('Delete session error:', error);
       toast.error(error.response?.data?.message || 'Error deleting session');
    }
  };

  // --- Not logged in - Marketing Page ---
  if (!token) {
    return (
      <div className="min-h-screen bg-white text-gray-800">
        {/* Navigation */}
        <nav className="border-b border-gray-200 sticky top-0 bg-white z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo */}
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg">
                  <svg className="w-4 h-4 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  InterviewAI
                </span>
              </div>
              {/* Auth Links */}
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Link
                  to="/login"
                  className="text-gray-700 hover:text-gray-900 font-medium px-3 py-2 text-sm sm:text-base sm:px-4 rounded-lg hover:bg-gray-100 transition"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 sm:px-6 rounded-lg font-semibold text-sm sm:text-base hover:shadow-lg transition"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-32">
            <div className="text-center max-w-4xl mx-auto">
              {/* Badge */}
              <div className="inline-flex items-center px-4 py-2 bg-indigo-50 rounded-full mb-4 sm:mb-6">
                <span className="text-xs sm:text-sm font-semibold text-indigo-600">✨ AI-Powered Interview Practice</span>
              </div>
              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
                Ace Your Next
                <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"> Interview</span>
              </h1>
              {/* Sub-headline */}
              <p className="text-base sm:text-xl text-gray-600 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
                Practice with AI-generated questions tailored to your resume and job description.
                Get instant feedback with detailed scoring on relevance and correctness.
              </p>
              {/* Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center px-6 py-3 sm:px-8 sm:py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-base sm:text-lg font-semibold rounded-xl hover:shadow-2xl transition transform hover:scale-105"
                >
                  Start Practicing Free
                  <svg className="w-5 h-5 ml-2 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center px-6 py-3 sm:px-8 sm:py-4 border-2 border-gray-300 text-gray-700 text-base sm:text-lg font-semibold rounded-xl hover:border-indigo-600 hover:text-indigo-600 transition"
                >
                  Learn More
                </a>
              </div>
            </div>
          </div>
          {/* Gradient Background Blobs */}
          <div aria-hidden="true" className="absolute top-0 left-0 w-full h-full -z-10 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 sm:w-96 sm:h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 sm:w-96 sm:h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="py-16 sm:py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">How It Works</h2>
              <p className="text-lg sm:text-xl text-gray-600">Three simple steps to interview mastery</p>
            </div>
            {/* Feature Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              <FeatureCard
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                }
                title="Upload Your Documents"
                description="Upload your resume and the job description you're targeting"
                step="01"
              />
              <FeatureCard
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                }
                title="AI Generates Questions"
                description="Get personalized technical and behavioral questions instantly"
                step="02"
              />
              <FeatureCard
                icon={
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
                title="Receive Detailed Feedback"
                description="Get scored on relevance and correctness with actionable insights"
                step="03"
              />
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="py-16 sm:py-20 bg-gradient-to-r from-indigo-600 to-purple-600">
          <div className="max-w-4xl mx-auto text-center px-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">
              Ready to Ace Your Interview?
            </h2>
            <p className="text-lg sm:text-xl text-indigo-100 mb-6 sm:mb-8">
              Join thousands of candidates who improved their interview skills
            </p>
            <Link
              to="/signup"
              className="inline-flex items-center px-6 py-3 sm:px-8 sm:py-4 bg-white text-indigo-600 text-base sm:text-lg font-semibold rounded-xl hover:shadow-2xl transition transform hover:scale-105"
            >
              Get Started Free
              <svg className="w-5 h-5 ml-2 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Footer (Optional) */}
        <footer className="py-8 text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} InterviewAI. All rights reserved.
        </footer>
      </div>
    );
  }

  // --- Logged in - Dashboard ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                InterviewAI
              </span>
            </div>
            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-2 sm:px-4 text-gray-700 hover:text-gray-900 text-sm sm:text-base font-medium hover:bg-gray-100 rounded-lg transition"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-6 sm:p-8 lg:p-12 mb-6 sm:mb-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3">Welcome Back! 👋</h1>
            <p className="text-indigo-100 text-base sm:text-lg mb-4 sm:mb-6 max-w-2xl">
              Ready to nail your next interview? Start a new practice session or review your past performances.
            </p>
            <button
              onClick={() => navigate('/chat-config')}
              className="inline-flex items-center px-5 py-2.5 sm:px-6 sm:py-3 bg-white text-indigo-600 font-semibold rounded-xl hover:shadow-xl transition transform hover:scale-105 text-sm sm:text-base"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Start New Interview
            </button>
          </div>
          {/* Background decoration */}
          <div aria-hidden="true" className="absolute top-0 right-0 w-32 h-32 sm:w-64 sm:h-64 bg-white opacity-10 rounded-full -mr-16 -mt-16 sm:-mr-32 sm:-mt-32"></div>
          <div aria-hidden="true" className="absolute bottom-0 left-0 w-24 h-24 sm:w-48 sm:h-48 bg-white opacity-10 rounded-full -ml-12 -mb-12 sm:-ml-24 sm:-mb-24"></div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <StatCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            title="Total Sessions"
            value={sessions.length}
            color="indigo"
          />
          <StatCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="Completed"
            value={sessions.filter(s => s.isCompleted).length}
            color="green"
          />
          <StatCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
            title="Average Score"
            value={
              sessions.filter(s => s.finalScore).length > 0
                ? (sessions.filter(s => s.finalScore).reduce((sum, s) => sum + parseFloat(s.finalScore), 0) / sessions.filter(s => s.finalScore).length).toFixed(1)
                : 'N/A'
            }
            color="purple"
          />
        </div>

        {/* Sessions List Container */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 sm:mb-6 gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your Sessions</h2>
            {sessions.length > 0 && (
              <span className="text-sm text-gray-500">{sessions.length} sessions</span>
            )}
          </div>

          {/* Conditional Rendering: Loading, Empty, List */}
          {loading ? (
            <div className="text-center py-12 sm:py-16">
              <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="text-gray-500 mt-3 sm:mt-4">Loading sessions...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 sm:py-16">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">No interviews yet</h3>
              <p className="text-gray-500 mb-4 sm:mb-6 text-sm sm:text-base">Start your first interview practice session now!</p>
              <button
                onClick={() => navigate('/chat-config')}
                className="inline-flex items-center px-5 py-2.5 sm:px-6 sm:py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition text-sm sm:text-base"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Session
              </button>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onView={() => navigate(`/chat/${session.id}`)}
                  onDelete={() => handleDelete(session.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Sub-Components (with minor responsive tweaks if needed) ---

// Feature Card Component
const FeatureCard = ({ icon, title, description, step }) => (
  <div className="relative bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg transition">
    {/* Step Badge */}
    <div className="absolute -top-4 -left-4 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg text-sm sm:text-base">
      {step}
    </div>
    {/* Icon */}
    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-3 sm:mb-4">
      {icon}
    </div>
    <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-600 text-sm sm:text-base">{description}</p>
  </div>
);

// Stat Card Component
const StatCard = ({ icon, title, value, color }) => {
  const colorClasses = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm text-gray-500 mb-1">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

// Session Card Component
const SessionCard = ({ session, onView, onDelete }) => {
  const getScoreColor = (score) => {
    // ... (score color logic remains the same) ...
     if (!score) return 'bg-gray-100 text-gray-700';
     if (score >= 8) return 'bg-green-100 text-green-700';
     if (score >= 5) return 'bg-yellow-100 text-yellow-700';
     return 'bg-red-100 text-red-700';
  };

  return (
    <div
      className="border border-gray-200 rounded-xl p-4 sm:p-6 hover:shadow-md hover:border-indigo-300 transition cursor-pointer group"
      onClick={onView}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        {/* Session Info */}
        <div className="flex-1 min-w-0"> {/* Added min-w-0 for flex truncation */}
           {/* Title and Status */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 sm:mb-3">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition truncate"> {/* Added truncate */}
              {session.sessionName}
            </h3>
            {session.isCompleted ? (
              <span className="flex-shrink-0 px-2.5 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                ✓ Completed
              </span>
            ) : (
              <span className="flex-shrink-0 px-2.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                In Progress
              </span>
            )}
          </div>

          {/* Metadata (Questions & Date) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {session.totalQuestions} questions
            </span>
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          {/* Scores (if completed) */}
          {session.isCompleted && session.finalScore && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className={`px-3 py-1 sm:px-4 sm:py-2 rounded-lg font-bold text-sm sm:text-base ${getScoreColor(session.finalScore)}`}>
                {session.finalScore}/10
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
                <span className="text-gray-600">
                  <span className="font-medium">Relevance:</span> {session.averageRelevance}/10
                </span>
                <span className="text-gray-600">
                  <span className="font-medium">Correctness:</span> {session.averageCorrectness}/10
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 flex sm:flex-col items-center gap-2 self-start sm:self-center">
          <button
            onClick={(e) => { e.stopPropagation(); onView(); }}
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
            title="View session"
            aria-label="View session"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
            title="Delete session"
            aria-label="Delete session"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};


export default Landing;
