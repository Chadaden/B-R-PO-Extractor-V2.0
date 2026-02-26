
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from '../constants';
import type { ProductionOrder } from '../types';

// Do not instantiate this at the top level.
// Create a new instance for each request to ensure it uses the most up-to-date API key.
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function extractDataFromPdfText(pdfText: string): Promise<ProductionOrder> {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please check your environment variables (GEMINI_API_KEY).");
  }

  const genAI = new GoogleGenAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const fullPrompt = SYSTEM_PROMPT.replace('{{RAW_TEXT}}', pdfText);

  try {
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error("Received an empty response from the API.");
    }

    // The API might return the JSON wrapped in markdown backticks.
    const cleanedText = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    const parsedData: ProductionOrder = JSON.parse(cleanedText);
    return parsedData;

  } catch (error) {
    console.error("Error calling Gemini API:", error);

    let message = "An error occurred while communicating with the AI service.";
    if (error instanceof SyntaxError) {
      message = "Failed to parse the AI response as JSON. The format was invalid.";
    } else if (error instanceof Error) {
      // Pass through the actual error message from the Gemini SDK if possible
      message = `Gemini API Error: ${error.message}`;
    }

    throw new Error(message);
  }
}
