
import {genkit, type Genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

let initializedAi: Genkit | null = null;

try {
  console.log("Genkit.ts: Attempting to initialize Genkit with GoogleAI plugin...");
  initializedAi = genkit({
    plugins: [googleAI()],
    // A opção 'model' não é válida diretamente aqui no construtor genkit().
    // Ela seria usada em ai.generate() ou em definePrompt(), por exemplo.
    // model: 'googleai/gemini-2.0-flash', 
  });
  console.log("Genkit.ts: Genkit initialized successfully.");
} catch (error) {
  console.error("Genkit.ts: CRITICAL ERROR DURING GENKIT INITIALIZATION:", error);
  // initializedAi remains null, subsequent calls to ai.defineFlow etc. might fail,
  // which is more specific than an Internal Server Error.
}

// Export a constant that might be null.
// If null, and code tries to use `ai.defineFlow()`, it will throw a runtime error.
export const ai = initializedAi;
