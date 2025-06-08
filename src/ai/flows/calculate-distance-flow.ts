
'use server';
/**
 * @fileOverview A Genkit flow to calculate driving distance between two addresses
 * using the Google Maps Directions API and estimate toll costs using an LLM
 * if tolls are indicated by the Directions API.
 *
 * - calculateDistance - A function that handles distance and toll cost estimation.
 * - CalculateDistanceInput - The input type for the calculateDistance function.
 * - CalculateDistanceOutput - The return type for the calculateDistance function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const CalculateDistanceInputSchema = z.object({
  originAddress: z.string().describe("The full starting address."),
  destinationAddress: z.string().describe("The full destination address."),
});
export type CalculateDistanceInput = z.infer<typeof CalculateDistanceInputSchema>;

const CalculateDistanceOutputSchema = z.object({
  distanceKm: z.number().describe("The calculated distance in kilometers (one-way)."),
  status: z.enum(['SUCCESS', 'SIMULATED', 'ERROR_NO_ADDRESS', 'ERROR_GOOGLE_API_FAILED', 'ERROR_GOOGLE_API_KEY_MISSING', 'ERROR_NO_ROUTE_FOUND', 'ERROR_LLM_TOLL_ESTIMATION']).describe("Status of the calculation."),
  errorMessage: z.string().optional().describe("Error message if the status is an error."),
  estimatedTollCostByAI: z.number().optional().nullable().describe("Rough estimate of one-way toll cost in BRL by AI, if tolls are likely. May not be accurate."),
  googleMapsApiIndicstedTolls: z.boolean().optional().describe("Indicates if Google Maps API suggested the route has tolls.")
});
export type CalculateDistanceOutput = z.infer<typeof CalculateDistanceOutputSchema>;

const TollEstimationLLMInputSchema = z.object({
  originAddress: z.string(),
  destinationAddress: z.string(),
  distanceKm: z.number(),
});

const TollEstimationLLMOutputSchema = z.object({
  estimatedTollOneWay: z.number().describe("Custo estimado do pedágio APENAS PARA O TRECHO DE IDA, em Reais (BRL). Se não for possível estimar ou não houver pedágios, retorne 0."),
});

let tollEstimationPrompt: any;

if (ai) {
  tollEstimationPrompt = ai.definePrompt({
    name: 'tollEstimationPrompt',
    input: { schema: TollEstimationLLMInputSchema },
    output: { schema: TollEstimationLLMOutputSchema },
    prompt: `Você é um assistente que ajuda a estimar custos de viagem.
Para uma viagem de carro no Brasil entre o endereço de origem:
"{originAddress}"
e o endereço de destino:
"{destinationAddress}"
que tem uma distância rodoviária de {distanceKm} km (apenas ida), qual seria uma estimativa numérica MUITO APROXIMADA do custo total com pedágios APENAS PARA O TRECHO DE IDA, em Reais (BRL)?

Responda apenas com o número estimado. Se não for possível fazer uma estimativa razoável ou se provavelmente não houver pedágios, retorne 0.
Não inclua unidades ou qualquer texto adicional na sua resposta, apenas o valor numérico.
Exemplo de resposta: 25.50
Exemplo de resposta se não houver pedágio ou estimativa: 0`,
    config: {
      temperature: 0.2,
    }
  });
}

async function fetchRouteFromGoogleMaps(
  origin: string,
  destination: string
): Promise<{ distanceKm: number; durationText: string; googleIndicatesTolls: boolean } | { error: string; status: CalculateDistanceOutput['status'] }> {
  console.log(`[DistanceFlow/GoogleMaps] Fetching route. Origin: "${origin}", Destination: "${destination}"`);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[DistanceFlow/GoogleMaps] Google API Key is missing from environment variables (expected GOOGLE_MAPS_API_KEY).");
    return { error: "Google API Key (GOOGLE_MAPS_API_KEY) is not configured.", status: 'ERROR_GOOGLE_API_KEY_MISSING' };
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

let calculateDistanceFlow: (input: CalculateDistanceInput) => Promise<CalculateDistanceOutput>;

if (ai && tollEstimationPrompt) {
  console.log("[DistanceFlow] Genkit AI instance (ai) IS available. Defining real flow with Google Maps and toll estimation.");
  calculateDistanceFlow = ai.defineFlow(
    {
      name: 'calculateDistanceFlow',
      inputSchema: CalculateDistanceInputSchema,
      outputSchema: CalculateDistanceOutputSchema,
    },
    async (input: CalculateDistanceInput): Promise<CalculateDistanceOutput> => {
      console.log("[DistanceFlow] Received input for Google Maps flow:", input);
      if (!input.originAddress || !input.destinationAddress) {
        return {
          distanceKm: 0,
          status: 'ERROR_NO_ADDRESS',
          errorMessage: "Origin or destination address is missing.",
        };
      }

      const routeResult = await fetchRouteFromGoogleMaps(input.originAddress, input.destinationAddress);

      if ('error' in routeResult) {
        return {
          distanceKm: 0,
          status: routeResult.status,
          errorMessage: routeResult.error,
        };
      }

      const { distanceKm, googleIndicatesTolls } = routeResult;
      let estimatedTollCostOneWay: number | null = null;

      console.log(`[DistanceFlow] Google Maps API indicated tolls: ${googleIndicatesTolls}`);

      if (googleIndicatesTolls) {
        console.log("[DistanceFlow] Google Maps indicated tolls. Attempting LLM toll estimation.");
        const tollInput = {
            originAddress: input.originAddress,
            destinationAddress: input.destinationAddress,
            distanceKm: distanceKm,
        };
        console.log("[DistanceFlow] Input for tollEstimationPrompt:", JSON.stringify(tollInput, null, 2));
        try {
          const llmResponse = await tollEstimationPrompt(tollInput);
          console.log("[DistanceFlow] Full LLM response for toll estimation:", JSON.stringify(llmResponse, null, 2));

          if (llmResponse.output && typeof llmResponse.output.estimatedTollOneWay === 'number') {
            estimatedTollCostOneWay = llmResponse.output.estimatedTollOneWay;
            console.log(`[DistanceFlow] LLM estimated one-way toll cost: ${estimatedTollCostOneWay}`);
          } else {
             console.warn("[DistanceFlow] LLM did not return a valid 'estimatedTollOneWay' number for toll estimation. LLM Output:", JSON.stringify(llmResponse.output, null, 2));
             estimatedTollCostOneWay = 0; // Fallback if LLM output is not as expected
          }
        } catch (llmError: any) {
          console.error("[DistanceFlow] Error during LLM toll estimation:", llmError);
           return {
            distanceKm: distanceKm,
            status: 'ERROR_LLM_TOLL_ESTIMATION',
            errorMessage: `Successfully fetched distance from Google Maps, but LLM toll estimation failed: ${llmError.message}`,
            estimatedTollCostByAI: null,
            googleMapsApiIndicstedTolls: googleIndicatesTolls,
          };
        }
      } else {
        console.log("[DistanceFlow] Google Maps did NOT indicate tolls. Skipping LLM toll estimation, setting toll cost to 0.");
        estimatedTollCostOneWay = 0;
      }
      
      console.log(`[DistanceFlow] Final estimatedTollCostOneWay before returning: ${estimatedTollCostOneWay}`);
      return {
        distanceKm: distanceKm,
        status: 'SUCCESS',
        estimatedTollCostByAI: estimatedTollCostOneWay,
        googleMapsApiIndicstedTolls: googleIndicatesTolls,
      };
    }
  );
} else {
  console.warn("[DistanceFlow] Genkit AI instance (ai) or tollEstimationPrompt is NOT available. Defining dummy flow.");
  calculateDistanceFlow = async (input: CalculateDistanceInput): Promise<CalculateDistanceOutput> => {
    console.warn("[DistanceFlow] Running DUMMY flow because Genkit AI or toll prompt is unavailable.");
    if (!input.originAddress || !input.destinationAddress) {
      return { distanceKm: 0, status: 'ERROR_NO_ADDRESS', errorMessage: "Origin or destination address is missing in dummy flow." };
    }
    const simulatedDistance = Math.floor(Math.random() * 450) + 50;
    return {
      distanceKm: simulatedDistance,
      status: 'SIMULATED',
      errorMessage: 'Dummy flow: Simulating API key missing, as Genkit/Google Maps is not fully initialized.',
      estimatedTollCostByAI: Math.random() > 0.5 ? Math.floor(Math.random() * 50) : 0,
      googleMapsApiIndicstedTolls: Math.random() > 0.5,
    };
  };
}

/**
 * Calculates the driving distance between two addresses and estimates toll costs.
 * This function wraps the Genkit flow `calculateDistanceFlow`.
 *
 * @param input - An object containing the origin and destination addresses.
 * @returns A promise that resolves to an object with distance, status, and optional toll information.
 */
export async function calculateDistance(input: CalculateDistanceInput): Promise<CalculateDistanceOutput> {
  if (typeof calculateDistanceFlow !== 'function') {
    console.error("[DistanceFlow] calculateDistanceFlow is not defined or not a function. Critical initialization issue.");
    return {
        distanceKm: Math.floor(Math.random() * 450) + 50,
        status: 'ERROR_GOOGLE_API_FAILED',
        errorMessage: 'Critical error: calculateDistanceFlow function is undefined or not properly initialized. Using simulated distance.',
        estimatedTollCostByAI: null,
        googleMapsApiIndicstedTolls: undefined,
    };
  }
  try {
    return await calculateDistanceFlow(input);
  } catch (error: any) {
    console.error("[DistanceFlow] Error executing calculateDistanceFlow:", error);
    return {
      distanceKm: Math.floor(Math.random() * 450) + 50,
      status: 'ERROR_GOOGLE_API_FAILED',
      errorMessage: `Error executing flow: ${error.message}. Using simulated distance.`,
      estimatedTollCostByAI: null,
      googleMapsApiIndicstedTolls: undefined,
    };
  }
}
