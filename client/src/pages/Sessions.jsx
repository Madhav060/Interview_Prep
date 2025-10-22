import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/axios';

const Sessions = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await api.get('/chat/sessions');
      if (response.data.success) {
        setSessions(response.data.sessions);
      }
    } catch (error) {
      toast.error('Error fetching sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this session?')) {
      return;
    }

    try {
      const response = await api.delete(`/chat/session/${id}`);
      if (response.data.success) {
        toast.success('Session deleted');
        fetchSessions();
      }
    } catch (error) {
      toast.error('Error deleting session');
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
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/upload')}
              className="text-gray-600 hover:text-gray-900"
              title="Back to upload"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Interview Sessions</h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* New Session Button */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/chat-config')}
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
          >
            + Start New Interview Session
          </button>
        </div>

        {/* Sessions List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Your Interview Sessions</h2>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="text-gray-500 mb-4">No interview sessions yet</p>
              <button
                onClick={() => navigate('/chat-config')}
                className="text-indigo-600 font-semibold hover:underline"
              >
                Start your first interview →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
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

// Session Card Component
const SessionCard = ({ session, onView, onDelete }) => {
  const getScoreColor = (score) => {
    if (!score) return 'text-gray-500';
    if (score >= 8) return 'text-green-600';
    if (score >= 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-2">{session.sessionName}</h3>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-3">
            <span>📝 {session.totalQuestions} questions</span>
            <span>📅 {new Date(session.createdAt).toLocaleDateString()}</span>
            {session.isCompleted && (
              <span className="text-green-600 font-medium">✓ Completed</span>
            )}
            {!session.isCompleted && (
              <span className="text-yellow-600 font-medium">⏳ In Progress</span>
            )}
          </div>
          
          {/* Scores */}
          {session.isCompleted && session.finalScore && (
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-gray-600">Overall: </span>
                <span className={`font-bold text-lg ${getScoreColor(session.finalScore)}`}>
                  {session.finalScore}/10
                </span>
              </div>
              <div>
                <span className="text-gray-600">Relevance: </span>
                <span className="font-semibold">{session.averageRelevance}/10</span>
              </div>
              <div>
                <span className="text-gray-600">Correctness: </span>
                <span className="font-semibold">{session.averageCorrectness}/10</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex space-x-2">
          <button
            onClick={onView}
            className="text-indigo-600 hover:text-indigo-800 p-2"
            title="View session"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="text-red-600 hover:text-red-800 p-2"
            title="Delete session"
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

export default Sessions;