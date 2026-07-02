require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GEMINI_API_KEY) {
  console.error('Missing API key in .env file!');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testConnection() {
  try {
    console.log('📡 Sending quick test ping to Gemini...');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('Respond with only the word: Connected!');
    console.log(`✅ Success! Gemini responded: ${result.response.text()}`);
  } catch (error) {
    console.error('❌ Google API Gateway rejected the call. Error details below:\n', error);
  }
}

testConnection();