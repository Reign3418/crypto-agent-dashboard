import { GoogleGenAI } from '@google/genai';

async function run() {
  const apiKey = process.env.GEMINI_AI_API_KEY;
  if (!apiKey) throw new Error("No API key found in process.env");
  
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'What is the absolute latest breaking news regarding Bitcoin right now? Do not answer the question, just give me the sources.',
    config: { tools: [{ googleSearch: {} }] }
  });
  
  const chunks = response.candidates[0].groundingMetadata?.groundingChunks || [];
  const urls = chunks
    .filter(chunk => chunk.web?.uri)
    .map(chunk => ({
      title: chunk.web.title,
      url: chunk.web.uri
    }));
    
  console.log("=== RAW SOURCES USED BY GEMINI JUST NOW ===");
  console.log(JSON.stringify(urls, null, 2));
}

run();
