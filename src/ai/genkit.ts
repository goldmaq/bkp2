
import {genkit, type Genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

let initializedAi: Genkit | null = null;

// Tenta usar a GOOGLE_MAPS_API_KEY se estiver definida,
// caso contrário, permite que o googleAI() procure por GEMINI_API_KEY ou GOOGLE_API_KEY.
const apiKeyForGenkit = process.env.GOOGLE_MAPS_API_KEY;

try {
  console.log("Genkit.ts: Attempting to initialize Genkit with GoogleAI plugin...");
  if (apiKeyForGenkit) {
    console.log("Genkit.ts: Using explicit API key (from GOOGLE_MAPS_API_KEY env var) for GoogleAI plugin.");
    initializedAi = genkit({
      plugins: [googleAI({ apiKey: apiKeyForGenkit })],
    });
  } else {
    console.warn("Genkit.ts: GOOGLE_MAPS_API_KEY not found. Attempting GoogleAI plugin initialization with default environment variable lookup (e.g., GEMINI_API_KEY or GOOGLE_API_KEY).");
    initializedAi = genkit({
      plugins: [googleAI()], // Fallback to default env var lookup
    });
  }
  console.log("Genkit.ts: Genkit initialized successfully.");
} catch (error) {
  console.error("Genkit.ts: CRITICAL ERROR DURING GENKIT INITIALIZATION:", error);
  // initializedAi remains null, subsequent calls to ai.defineFlow etc. might fail,
  // which is more specific than an Internal Server Error.
}

// Export a constant that might be null.
// If null, and code tries to use `ai.defineFlow()`, it will throw a runtime error.
export const ai = initializedAi;
