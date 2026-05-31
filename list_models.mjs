import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = "AIzaSyDkBlveqFiVRVMltgPByFTw8VW0kVQZ6Hg";

async function test() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("API Error:", error);
  }
}

test();
