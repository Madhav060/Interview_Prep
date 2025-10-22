require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
  try {
    console.log('Testing Gemini API...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-09-2025' });
    const result = await model.generateContent('Say hello');
    const response = await result.response;
    console.log('✅ API Working! Response:', response.text());
  } catch (error) {
    console.error('❌ API Error:', error.message);
  }
}

test();