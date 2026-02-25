
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

  const ai = new GoogleGenAI({ apiKey });

  const fullPrompt = SYSTEM_PROMPT.replace('{{RAW_TEXT}}', pdfText);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: fullPrompt,
    });

    const text = response.text;
    if (!text) {
      throw new Error("Received an empty response from the API.");
    }

    // The API might return the JSON wrapped in markdown backticks.
    const cleanedText = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');

    const parsedData: ProductionOrder = JSON.parse(cleanedText);
    return parsedData;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse the API response as JSON. The format was invalid.");
    }
    throw new Error("An error occurred while communicating with the AI service.");
  }
}
