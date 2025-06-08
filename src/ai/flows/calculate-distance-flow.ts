
'use server';
/**
 * @fileOverview A Genkit flow to calculate driving distance between two addresses
 * using the Google Maps Directions API and estimate toll costs using AI.
 *
 * - calculateDistance - A function that handles distance calculation and toll estimation.
 * - CalculateDistanceInput - The input type for the calculateDistance function.
 * - CalculateDistanceOutput - The return type for the calculateDistance function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { ExecutablePrompt } from 'genkit/prompt';

const CalculateDistanceInputSchema = z.object({
  originAddress: z.string().describe("The full starting address."),
  destinationAddress: z.string().describe("The full destination address."),
});
export type CalculateDistanceInput = z.infer<typeof CalculateDistanceInputSchema>;

const CalculateDistanceOutputSchema = z.object({
  distanceKm: z.number().describe("The calculated distance in kilometers (one-way)."),
  status: z.enum(['SUCCESS', 'SIMULATED', 'ERROR_NO_ADDRESS', 'ERROR_GOOGLE_API_FAILED', 'ERROR_GOOGLE_API_KEY_MISSING', 'ERROR_NO_ROUTE_FOUND', 'ERROR_AI_TOLL_ESTIMATION_FAILED']).describe("Status of the calculation."),
  errorMessage: z.string().optional().describe("Error message if the status is an error."),
  estimatedTollCostByAI: z.number().optional().nullable().describe("Estimated toll cost (one-way) in BRL, calculated by AI if Google Maps indicates tolls. May be null if no tolls or estimation fails."),
  googleMapsApiIndicstedTolls: z.boolean().optional().describe("Indicates if Google Maps API suggested the route has tolls.")
});
export type CalculateDistanceOutput = z.infer<typeof CalculateDistanceOutputSchema>;


const TollEstimationLLMInputSchema = z.object({
  origin: z.string().describe("The origin address."),
  destination: z.string().describe("The destination address."),
  distanceKm: z.number().describe("The distance in kilometers between origin and destination."),
  country: z.string().default("Brasil").describe("The country for toll estimation, defaults to Brasil."),
});

const TollEstimationLLMOutputSchema = z.object({
  estimatedTollOneWay: z
    .number()
    .nullable()
    .describe(
      'The estimated one-way toll cost in BRL. Null if no tolls are expected or estimation is not possible.'
    ),
  reasoning: z.string().optional().describe('Brief reasoning for the toll estimation.'),
});

let tollEstimationPrompt: ExecutablePrompt<z.infer<typeof TollEstimationLLMInputSchema>, z.infer<typeof TollEstimationLLMOutputSchema>> | undefined;
let calculateDistanceFlow: ((input: CalculateDistanceInput) => Promise<CalculateDistanceOutput>) | undefined;

async function fetchRouteFromGoogleMaps(
  origin: string,
  destination: string
): Promise<{ distanceKm: number; durationText: string; googleIndicatesTolls: boolean } | { error: string; status: CalculateDistanceOutput['status'] }> {
  console.log(`[DistanceFlow/GoogleMaps] Fetching route. Origin: "${origin}", Destination: "${destination}"`);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[DistanceFlow/GoogleMaps] Google API Key for Maps is missing from environment variables (expected GOOGLE_MAPS_API_KEY).");
    return { error: "Google Maps API Key (GOOGLE_MAPS_API_KEY) is not configured.", status: 'ERROR_GOOGLE_API_KEY_MISSING' };
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${apiKey}&language=pt-BR&units=metric`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
      console.warn(`[DistanceFlow/GoogleMaps] API error or no route found. Status: ${data.status}, Message: ${data.error_message || 'No routes found'}`);
      return { error: data.error_message || `No route found between ${origin} and ${destination}. Google Status: ${data.status}`, status: 'ERROR_NO_ROUTE_FOUND' };
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    if (!leg.distance || !leg.duration) {
        console.warn("[DistanceFlow/GoogleMaps] API response missing distance or duration.", leg);
        return { error: "Incomplete route information from Google Maps API.", status: 'ERROR_GOOGLE_API_FAILED'};
    }

    const distanceKm = parseFloat((leg.distance.value / 1000).toFixed(1));
    const durationText = leg.duration.text;

    let googleIndicatesTolls = false;
    if (route.warnings && route.warnings.some((w: string) => w.toLowerCase().includes("pedágio") || w.toLowerCase().includes("toll"))) {
        googleIndicatesTolls = true;
    }
    if (leg.tolls_info || (leg as any).tolls ) { 
        googleIndicatesTolls = true;
    }
    if (route.summary && (route.summary.toLowerCase().includes("toll") || route.summary.toLowerCase().includes("pedágio"))){
        googleIndicatesTolls = true;
    }
    
    console.log(`[DistanceFlow/GoogleMaps] Route found: Distance ${distanceKm} km, Duration ${durationText}, Google Indicates Tolls: ${googleIndicatesTolls}`);
    return { distanceKm, durationText, googleIndicatesTolls };
  } catch (error: any) {
    console.error("[DistanceFlow/GoogleMaps] Error fetching route:", error);
    return { error: `Failed to fetch route from Google Maps: ${error.message}`, status: 'ERROR_GOOGLE_API_FAILED' };
  }
}

if (ai) {
  console.log("[DistanceFlow] Genkit AI instance (ai) IS available. Defining real flow with Google Maps and AI Toll Estimation.");
  
  tollEstimationPrompt = ai.definePrompt({
    name: 'tollEstimationPrompt',
    input: { schema: TollEstimationLLMInputSchema },
    output: { schema: TollEstimationLLMOutputSchema },
    prompt: `Você é um especialista em estimar custos de pedágio para rotas no Brasil.
Dada a origem, destino e distância, estime o custo de pedágio APENAS DE IDA em BRL (Reais Brasileiros).
Considere os tipos de veículos mais comuns (carros de passeio).
Se não houver pedágios ou a estimativa não for confiável, retorne null para estimatedTollOneWay.

Origem: {{{origin}}}
Destino: {{{destination}}}
Distância: {{{distanceKm}}} km
País: {{{country}}}

Forneça sua estimativa e uma breve justificativa.
Exemplo de saída se houver pedágio:
{ "estimatedTollOneWay": 25.50, "reasoning": "Estimativa baseada na distância e rotas comuns com pedágios entre as cidades." }
Exemplo de saída se não houver pedágio provável:
{ "estimatedTollOneWay": null, "reasoning": "Rota provavelmente não possui pedágios significativos." }
`,
  });

  calculateDistanceFlow = ai.defineFlow(
    {
      name: 'calculateDistanceFlow',
      inputSchema: CalculateDistanceInputSchema,
      outputSchema: CalculateDistanceOutputSchema,
    },
    async (input: CalculateDistanceInput): Promise<CalculateDistanceOutput> => {
      console.log("[DistanceFlow] Received input for real flow:", input);
      if (!input.originAddress || !input.destinationAddress) {
        return {
          distanceKm: 0,
          status: 'ERROR_NO_ADDRESS',
          errorMessage: "Origin or destination address is missing.",
          estimatedTollCostByAI: null,
        };
      }

      const routeResult = await fetchRouteFromGoogleMaps(input.originAddress, input.destinationAddress);

      if ('error' in routeResult) {
        return {
          distanceKm: 0,
          status: routeResult.status,
          errorMessage: routeResult.error,
          estimatedTollCostByAI: null,
        };
      }

      const { distanceKm, googleIndicatesTolls } = routeResult;
      let estimatedTollCostOneWay: number | null = null;
      let aiEstimationStatus: CalculateDistanceOutput['status'] = 'SUCCESS';

      console.log(`[DistanceFlow] Google Maps API indicated tolls: ${googleIndicatesTolls}`);

      if (googleIndicatesTolls && tollEstimationPrompt) {
        try {
          const tollInput = {
            origin: input.originAddress,
            destination: input.destinationAddress,
            distanceKm: distanceKm,
            country: "Brasil",
          };
          console.log("[DistanceFlow] Input for tollEstimationPrompt:", JSON.stringify(tollInput, null, 2));
          
          const llmResponse = await tollEstimationPrompt(tollInput); // Corrected call

          console.log("[DistanceFlow] Full LLM response for toll estimation:", JSON.stringify(llmResponse, null, 2));

          if (llmResponse && llmResponse.output && typeof llmResponse.output.estimatedTollOneWay === 'number') {
            estimatedTollCostOneWay = llmResponse.output.estimatedTollOneWay;
          } else if (llmResponse && llmResponse.output && llmResponse.output.estimatedTollOneWay === null) {
            estimatedTollCostOneWay = null; 
          } else {
            console.warn("[DistanceFlow] AI toll estimation did not return a valid number or null. Response:", llmResponse?.output);
            estimatedTollCostOneWay = 0; 
            aiEstimationStatus = 'ERROR_AI_TOLL_ESTIMATION_FAILED';
          }
        } catch (e: any) {
          console.error("[DistanceFlow] Error during AI toll estimation:", e);
          estimatedTollCostOneWay = 0; 
          aiEstimationStatus = 'ERROR_AI_TOLL_ESTIMATION_FAILED';
        }
      } else {
         console.log("[DistanceFlow] Google Maps did not indicate tolls or tollEstimationPrompt not defined. Skipping AI toll estimation.");
         if (googleIndicatesTolls && !tollEstimationPrompt) {
           console.warn("[DistanceFlow] Tolls indicated by Maps, but tollEstimationPrompt is undefined. This can happen if Genkit AI failed to initialize.");
         }
      }

      console.log(`[DistanceFlow] Final estimatedTollCostOneWay before returning: ${estimatedTollCostOneWay}`);
      
      return {
        distanceKm: distanceKm,
        status: aiEstimationStatus, 
        estimatedTollCostByAI: estimatedTollCostOneWay,
        googleMapsApiIndicstedTolls: googleIndicatesTolls,
        errorMessage: aiEstimationStatus === 'ERROR_AI_TOLL_ESTIMATION_FAILED' ? "AI toll estimation failed." : undefined,
      };
    }
  );
} else {
  console.warn("[DistanceFlow] Genkit AI instance (ai) is NOT available. Defining dummy flow.");
  calculateDistanceFlow = async (input: CalculateDistanceInput): Promise<CalculateDistanceOutput> => {
    console.warn("[DistanceFlow] Running DUMMY flow because Genkit AI is unavailable.");
    if (!input.originAddress || !input.destinationAddress) {
      return { distanceKm: 0, status: 'ERROR_NO_ADDRESS', errorMessage: "Origin or destination address is missing in dummy flow.", estimatedTollCostByAI: null };
    }
    const simulatedDistance = Math.floor(Math.random() * 450) + 50;
    const simGoogleIndicatesTolls = Math.random() > 0.5;
    let simTollCost: number | null = null;
    if (simGoogleIndicatesTolls) {
        simTollCost = Math.random() > 0.3 ? Math.floor(Math.random() * 50) + 5 : null;
    }

    return {
      distanceKm: simulatedDistance,
      status: 'SIMULATED',
      errorMessage: 'Dummy flow: Simulating API key missing, as Genkit/Google Maps is not fully initialized.',
      estimatedTollCostByAI: simTollCost,
      googleMapsApiIndicstedTolls: simGoogleIndicatesTolls,
    };
  };
}

/**
 * Calculates the driving distance between two addresses and estimates toll costs using AI.
 * This function wraps the Genkit flow `calculateDistanceFlow`.
 *
 * @param input - An object containing the origin and destination addresses.
 * @returns A promise that resolves to an object with distance, status, toll indication, and AI toll cost estimation.
 */
export async function calculateDistance(input: CalculateDistanceInput): Promise<CalculateDistanceOutput> {
  if (typeof calculateDistanceFlow !== 'function') {
    console.error("[DistanceFlow] calculateDistanceFlow is not defined or not a function. This usually means Genkit AI (ai) failed to initialize. Check genkit.ts logs.");
    // Simulate an error similar to what would happen if the flow couldn't run
    return {
        distanceKm: 0, // Or a random number if you prefer for dummy
        status: 'ERROR_GOOGLE_API_FAILED', // A generic error status
        errorMessage: 'Critical error: Distance calculation flow is not available due to AI initialization failure.',
        estimatedTollCostByAI: null,
        googleMapsApiIndicstedTolls: undefined,
    };
  }
  try {
    return await calculateDistanceFlow(input);
  } catch (error: any) {
    console.error("[DistanceFlow] Error executing calculateDistanceFlow:", error);
    return {
      distanceKm: 0,
      status: 'ERROR_GOOGLE_API_FAILED',
      errorMessage: `Error executing flow: ${error.message}.`,
      estimatedTollCostByAI: null,
      googleMapsApiIndicstedTolls: undefined,
    };
  }
}
