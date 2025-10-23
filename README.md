# InterviewAI - AI Interview Prep

## Overview

`InterviewAI` is a web application that helps users prepare for job interviews using AI. Users upload resumes and target job descriptions, generating personalized interview questions and receiving AI-driven feedback.

## Features

* **User Authentication:** Secure signup/login with JWT.
* **Document Upload:** Upload resume/job description PDFs (<2MB) with Cloudinary storage.
* **Interview Sessions:** Create named sessions, choose number of questions (2-4), view/delete past sessions.
* **AI Question Generation:** Uses Google Gemini AI for technical (MERN) and behavioral questions.
* **Interactive Practice:** Answer questions in a chat interface.
* **AI Answer Evaluation:** Scores relevance and correctness, provides textual feedback.
* **Session History:** Review past sessions with questions, answers, scores, feedback.
* **RAG Implementation:** Uses resume embeddings to provide context for AI evaluation.
* **Responsive UI:** Built with React and Tailwind CSS.

## Tech Stack

**Frontend:** React 19, Vite, Tailwind CSS, React Router DOM, Axios, React Dropzone, React Hot Toast

**Backend:** Node.js, Express, MongoDB (Mongoose), Google Gemini AI API, Cloudinary, JWT, bcryptjs, Multer, pdf-parse, dotenv, cors, express-rate-limit

## Project Structure

```
/ 
├── client/       # React frontend
├── server/       # Node.js backend
├── .gitignore
└── README.md     # This file
```

## Setup & Installation

> **Important:** The `.env` file is critical for both backend and frontend. Ensure all necessary environment variables are set correctly.

### Backend (.env variables)

```
PORT=5000
MONGODB_URI=<your_mongodb_connection_string>
JWT_SECRET=<generate_a_strong_secret_key>
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:5173 # Or your frontend's URL
CLOUDINARY_CLOUD_NAME=<your_cloudinary_cloud_name>
CLOUDINARY_API_KEY=<your_cloudinary_api_key>
CLOUDINARY_API_SECRET=<your_cloudinary_api_secret>
GEMINI_API_KEY=<your_google_gemini_api_key>
```

### Frontend (.env variables, optional)

```
VITE_API_URL=http://localhost:5000/api
```

1. Clone repository:

```bash
git clone https://github.com/Madhav060/Interview_Prep.git
cd Interview_Prep
```

2. Setup Backend:

```bash
cd server
npm install
npm run dev
```

3. Setup Frontend:

```bash
cd ../client
npm install
npm run dev
```

Access the app at `http://localhost:5173`.

## How It Works

1. Signup/Login
2. Create an interview session
3. Upload resume and job description PDFs
4. Server extracts text, generates embeddings, stores data
5. AI generates interview questions
6. User answers questions
7. Server sends answers + context to AI for evaluation
8. Feedback and scores returned
9. Users review completed sessions

## Contributing

Pull requests are welcome.

## License

Licensed under ISC (see `LICENSE` file if available).
