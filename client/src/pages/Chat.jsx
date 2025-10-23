import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/axios';

// Parse questions from text into structured format
const parseQuestions = (text) => {
  const lines = text.split('\n').filter(line => line.trim());
  const questions = [];
  
  for (let line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)/);
    if (match) {
      questions.push({
        number: parseInt(match[1]),
        text: match[2].trim()
      });
    }
  }
  
  return questions;
};

const Chat = () => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [evaluations, setEvaluations] = useState(null);
  const navigate = useNavigate();
  const { sessionId } = useParams();

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId]);

  const loadSession = async (id) => {
    try {
      const response = await api.get(`/chat/session/${id}`);
      if (response.data.success) {
        const session = response.data.session;
        setSessionInfo(session);
        
        // Check if already completed
        if (session.isCompleted && session.messages.length > 0) {
          // Extract questions and evaluations
          const questionsText = session.messages[0]?.content || '';
          const parsedQuestions = parseQuestions(questionsText);
          setQuestions(parsedQuestions);
          
          // Extract evaluations from messages
          const evals = session.messages
            .filter(msg => msg.role === 'assistant' && msg.relevanceScore !== undefined)
            .map((msg, idx) => ({
              questionNumber: idx + 1,
              relevanceScore: msg.relevanceScore,
              correctnessScore: msg.correctnessScore,
              feedback: msg.content.replace(/\*\*Question \d+ Feedback:\*\*\n/, '')
            }));
          
          setEvaluations(evals);
        } else {
          // Load questions for answering
          const questionsText = session.messages[0]?.content || '';
          const parsedQuestions = parseQuestions(questionsText);
          setQuestions(parsedQuestions);
          
          // Initialize empty answers
          const initialAnswers = {};
          parsedQuestions.forEach(q => {
            initialAnswers[q.number] = '';
          });
          setAnswers(initialAnswers);
        }
      }
    } catch (error) {
      toast.error('Error loading session');
      navigate('/');
    } finally {
      setInitializing(false);
    }
  };

  const handleNext = () => {
    if (!currentAnswer.trim()) {
      toast.error('Please provide an answer before proceeding');
      return;
    }

    // Save current answer
    const currentQuestion = questions[currentQuestionIndex];
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.number]: currentAnswer
    }));

    // Move to next question
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      // Load next question's answer if exists
      const nextQuestion = questions[currentQuestionIndex + 1];
      setCurrentAnswer(answers[nextQuestion.number] || '');
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      // Save current answer
      const currentQuestion = questions[currentQuestionIndex];
      setAnswers(prev => ({
        ...prev,
        [currentQuestion.number]: currentAnswer
      }));

      setCurrentQuestionIndex(currentQuestionIndex - 1);
      // Load previous question's answer
      const prevQuestion = questions[currentQuestionIndex - 1];
      setCurrentAnswer(answers[prevQuestion.number] || '');
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmitAll = async () => {
    if (!currentAnswer.trim()) {
      toast.error('Please provide an answer before submitting');
      return;
    }

    // Save last answer
    const currentQuestion = questions[currentQuestionIndex];
    const finalAnswers = {
      ...answers,
      [currentQuestion.number]: currentAnswer
    };

    // Validate all questions are answered
    const unansweredQuestions = questions.filter(q => !finalAnswers[q.number]?.trim());
    
    if (unansweredQuestions.length > 0) {
      toast.error(`Please answer all questions. Missing: Question ${unansweredQuestions.map(q => q.number).join(', ')}`);
      return;
    }

    setSubmitting(true);

    try {
      // Format answers as required: "1. Answer\n2. Answer\n3. Answer"
      const formattedAnswers = questions
        .map(q => `${q.number}. ${finalAnswers[q.number].trim()}`)
        .join('\n');

      const response = await api.post('/chat/submit-answers', {
        answersText: formattedAnswers,
        chatId: sessionId,
      });

      if (response.data.success) {
        toast.success('Interview completed! 🎉');
        setEvaluations(response.data.evaluations);
        
        // Update session info
        setSessionInfo(prev => ({
          ...prev,
          isCompleted: true,
          finalScore: response.data.finalScore,
          averageRelevance: response.data.averageRelevance,
          averageCorrectness: response.data.averageCorrectness,
        }));

        // Scroll to top to see results
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error submitting answers');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
    toast.success('Logged out successfully');
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-700 font-medium">Loading interview session...</p>
        </div>
      </div>
    );
  }

  const isCompleted = sessionInfo?.isCompleted || evaluations !== null;
  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const isFirstQuestion = currentQuestionIndex === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
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
                <h1 className="text-xl font-bold text-gray-900">
                  {sessionInfo?.sessionName || 'Interview Session'}
                </h1>
                <p className="text-sm text-gray-500">
                  {!isCompleted && `Question ${currentQuestionIndex + 1} of ${questions.length}`}
                  {isCompleted && 'Completed'}
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

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Final Results Banner */}
        {isCompleted && sessionInfo?.finalScore && (
          <FinalResultsBanner session={sessionInfo} />
        )}

        {/* Question or Results */}
        {!isCompleted ? (
          <QuestionView
            question={currentQuestion}
            questionIndex={currentQuestionIndex}
            totalQuestions={questions.length}
            answer={currentAnswer}
            onAnswerChange={setCurrentAnswer}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onSubmit={handleSubmitAll}
            isFirstQuestion={isFirstQuestion}
            isLastQuestion={isLastQuestion}
            submitting={submitting}
            answeredCount={Object.values(answers).filter(a => a?.trim()).length + (currentAnswer.trim() ? 1 : 0)}
          />
        ) : (
          <ResultsView
            questions={questions}
            evaluations={evaluations}
          />
        )}

        {/* Actions for Completed */}
        {isCompleted && (
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-white text-gray-700 border-2 border-gray-300 rounded-xl font-semibold hover:border-gray-400 transition"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => navigate('/chat-config')}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition"
            >
              Start New Interview
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Question View Component
const QuestionView = ({ 
  question, 
  questionIndex, 
  totalQuestions, 
  answer, 
  onAnswerChange, 
  onPrevious, 
  onNext, 
  onSubmit,
  isFirstQuestion,
  isLastQuestion,
  submitting,
  answeredCount
}) => {
  const progress = ((questionIndex + 1) / totalQuestions) * 100;
  const isBehavioral = questionIndex === totalQuestions - 1;

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">
            Progress: {questionIndex + 1}/{totalQuestions}
          </span>
          <span className="text-sm text-gray-500">
            {answeredCount}/{totalQuestions} answered
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-start space-x-3">
          <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">
              {isBehavioral ? 'Behavioral Question' : 'Technical Question'}
            </h3>
            <p className="text-sm text-blue-800">
              {isBehavioral 
                ? 'This question assesses your soft skills, teamwork, and problem-solving approach.'
                : 'This question evaluates your technical knowledge and expertise related to the role.'}
            </p>
          </div>
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Question Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-white bg-opacity-20 backdrop-blur-sm rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0">
              {question.number}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  isBehavioral 
                    ? 'bg-purple-400 bg-opacity-30' 
                    : 'bg-blue-400 bg-opacity-30'
                }`}>
                  {isBehavioral ? '🗣️ Behavioral' : '💻 Technical'}
                </span>
              </div>
              <h2 className="text-xl font-bold leading-relaxed">
                {question.text}
              </h2>
            </div>
          </div>
        </div>

        {/* Answer Input */}
        <div className="p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Your Answer:
          </label>
          <textarea
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            placeholder="Type your detailed answer here... Be specific and thorough."
            className="w-full px-4 py-4 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition"
            rows="12"
            disabled={submitting}
          />
          
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className={`flex items-center ${answer.trim() ? 'text-green-600' : 'text-gray-400'}`}>
              {answer.trim() ? (
                <>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Answer provided
                </>
              ) : (
                'Please provide an answer'
              )}
            </span>
            <span className="text-gray-500">
              {answer.length} characters
            </span>
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <button
              onClick={onPrevious}
              disabled={isFirstQuestion}
              className="flex items-center space-x-2 px-5 py-2.5 bg-white text-gray-700 border-2 border-gray-300 rounded-lg font-semibold hover:border-gray-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Previous</span>
            </button>

            {!isLastQuestion ? (
              <button
                onClick={onNext}
                disabled={!answer.trim()}
                className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Next Question</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={submitting || !answer.trim()}
                className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Evaluating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Submit All Answers</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Helpful Tips */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-5">
        <h4 className="font-semibold text-purple-900 mb-2 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Tips for a Great Answer
        </h4>
        <ul className="text-sm text-purple-800 space-y-1">
          <li>• Be specific and provide concrete examples</li>
          <li>• Reference your experience from your resume when relevant</li>
          <li>• Explain your thought process and reasoning</li>
          <li>• {isBehavioral ? 'Use the STAR method (Situation, Task, Action, Result)' : 'Demonstrate technical depth and understanding'}</li>
        </ul>
      </div>
    </div>
  );
};

// Final Results Banner Component
const FinalResultsBanner = ({ session }) => {
  const getScoreColor = (score) => {
    if (score >= 8) return 'from-green-500 to-emerald-600';
    if (score >= 5) return 'from-yellow-500 to-orange-600';
    return 'from-red-500 to-pink-600';
  };

  const getScoreEmoji = (score) => {
    if (score >= 8) return '🌟';
    if (score >= 6) return '👍';
    if (score >= 4) return '📈';
    return '💪';
  };

  return (
    <div className={`bg-gradient-to-r ${getScoreColor(session.finalScore)} rounded-2xl shadow-xl p-8 mb-8 text-white`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Interview Complete! {getScoreEmoji(session.finalScore)}</h2>
          <p className="text-white text-opacity-90">Here's your comprehensive evaluation</p>
        </div>
        <div className="text-center bg-white bg-opacity-20 rounded-2xl px-8 py-4 backdrop-blur-sm">
          <div className="text-5xl font-bold mb-1">{session.finalScore}</div>
          <div className="text-sm opacity-90">Overall Score</div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white bg-opacity-20 rounded-xl p-4 backdrop-blur-sm">
          <div className="text-3xl font-bold mb-1">{session.averageRelevance}/10</div>
          <div className="text-sm opacity-90">Relevance</div>
          <p className="text-xs mt-2 opacity-75">How well you addressed questions</p>
        </div>
        <div className="bg-white bg-opacity-20 rounded-xl p-4 backdrop-blur-sm">
          <div className="text-3xl font-bold mb-1">{session.averageCorrectness}/10</div>
          <div className="text-sm opacity-90">Correctness</div>
          <p className="text-xs mt-2 opacity-75">Accuracy of your answers</p>
        </div>
      </div>
    </div>
  );
};

// Results View Component - ONLY RELEVANCE AND CORRECTNESS
const ResultsView = ({ questions, evaluations }) => {
  return (
    <div className="space-y-6">
      {evaluations && evaluations.map((evaluation, idx) => (
        <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 border-b border-gray-200">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl flex items-center justify-center font-bold flex-shrink-0">
                {evaluation.questionNumber}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {questions[idx]?.text}
                </h3>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {/* Scores - Only Relevance and Correctness */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <ScoreCard label="Relevance" score={evaluation.relevanceScore} />
              <ScoreCard label="Correctness" score={evaluation.correctnessScore} />
            </div>
            
            {/* Feedback */}
            <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg p-5 border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                Detailed Feedback
              </h4>
              <p className="text-gray-700 leading-relaxed">{evaluation.feedback}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Score Card Component
const ScoreCard = ({ label, score }) => {
  const getScoreColor = (score) => {
    if (score >= 8) return 'bg-green-100 text-green-700 border-green-200';
    if (score >= 5) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  return (
    <div className={`rounded-lg p-4 border-2 ${getScoreColor(score)} text-center`}>
      <div className="text-3xl font-bold mb-1">{score}/10</div>
      <div className="text-sm font-semibold">{label}</div>
    </div>
  );
};

export default Chat;