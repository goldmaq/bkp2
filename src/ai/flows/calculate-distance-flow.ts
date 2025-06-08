
'use server';
/**
 * @fileOverview A Genkit flow to calculate driving distance between two addresses
 * and optionally estimate toll costs using an LLM.
 * It attempts to use Nominatim for geocoding and Haversine for distance,
 * falling back to random simulation if API calls fail.
 * Toll cost estimation is a very rough approximation by an LLM.
 *
 * - calculateDistance - A function that handles distance and toll cost estimation.
 * - CalculateDistanceInput - The input type for the calculateDistance function.
 * - CalculateDistanceOutput - The return type for the calculateDistance function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit'; // Flow type is not needed if we simplify the variable type

// Define Zod schemas based on the interfaces from types/index.ts
const CalculateDistanceInputSchema = z.object({
  originAddress: z.string().describe("The full starting address."),
  destinationAddress: z.string().describe("The full destination address."),
});
export type CalculateDistanceInput = z.infer<typeof CalculateDistanceInputSchema>;


const CalculateDistanceOutputSchema = z.object({
  distanceKm: z.number().describe("The calculated distance in kilometers."),
  status: z.enum(['SUCCESS', 'ERROR_NO_ADDRESS', 'ERROR_API_FAILED', 'SIMULATED', 'ERROR_GEOCODING_FAILED', 'ERROR_LLM_TOLL_ESTIMATION']).describe("Status of the calculation."),
  errorMessage: z.string().optional().describe("Error message if the status is an error."),
  estimatedTollCostByAI: z.number().optional().nullable().describe("Rough estimate of one-way toll cost in BRL by AI, if available. May not be accurate."),
});
export type CalculateDistanceOutput = z.infer<typeof CalculateDistanceOutputSchema>;

// Input schema for the toll estimation LLM prompt
const TollEstimationLLMInputSchema = z.object({
  originAddress: z.string(),
  destinationAddress: z.string(),
  distanceKm: z.number(),
});

// Output schema for the toll estimation LLM prompt
const TollEstimationLLMOutputSchema = z.object({
  estimatedTollOneWay: z.number().describe("Custo estimado do pedágio APENAS PARA O TRECHO DE IDA, em Reais (BRL). Se não for possível estimar ou não houver pedágios, retorne 0."),
});

let tollEstimationPrompt: any; // Define it later if ai is available

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
que tem uma distância rodoviária aproximada de {distanceKm} km (apenas ida), qual seria uma estimativa numérica MUITO APROXIMADA do custo total com pedágios APENAS PARA O TRECHO DE IDA, em Reais (BRL)?

Responda apenas com o número estimado. Se não for possível fazer uma estimativa razoável ou se provavelmente não houver pedágios, retorne 0.
Não inclua unidades ou qualquer texto adicional na sua resposta, apenas o valor numérico.
Exemplo de resposta: 25.50
Exemplo de resposta se não houver pedágio ou estimativa: 0`,
    config: {
      temperature: 0.2, // Lower temperature for more factual/less creative response
    }
  });
}


// Helper function to fetch with timeout
async function fetchWithTimeout(resource: RequestInfo | URL, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 5000 } = options; // Default timeout 5 seconds

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const response = await fetch(resource, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

// Helper function to geocode an address using Nominatim
async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  console.log(`[DistanceFlow] Geocoding address: "${address}" with URL: ${nominatimUrl}`);
  try {
    const response = await fetchWithTimeout(nominatimUrl, {
      headers: {
        'User-Agent': 'GoldMaqControlApp/1.0 (Firebase Studio Project; +gold-maq-control)',
      },
      timeout: 5000,
    });

    if (!response.ok) {
      console.error(`[DistanceFlow] Nominatim API error for "${address}": ${response.status} ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      console.log(`[DistanceFlow] Geocoded "${address}" to: lat=${lat}, lon=${lon}`);
      return { latitude: parseFloat(lat), longitude: parseFloat(lon) };
    }
    console.warn(`[DistanceFlow] No geocoding results for address: "${address}"`);
    return null;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`[DistanceFlow] Error geocoding address "${address}": Request timed out.`);
    } else {
      console.error(`[DistanceFlow] Error geocoding address "${address}":`, error);
    }
    return null;
  }
}

// Helper function to calculate Haversine distance
function haversineDistance(
  coords1: { latitude: number; longitude: number },
  coords2: { latitude: number; longitude: number }
): number {
  function toRad(x: number): number {
    return x * Math.PI / 180;
  }

  const R = 6371; // Earth's radius in kilometers

  const dLat = toRad(coords2.latitude - coords1.latitude);
  const dLon = toRad(coords2.longitude - coords1.longitude);
  const lat1Rad = toRad(coords1.latitude);
  const lat2Rad = toRad(coords2.latitude);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

// Placeholder for getSimulatedDistance
function getSimulatedDistance(): number {
  return Math.floor(Math.random() * 450) + 50;
}

// Declare calculateDistanceFlow with its type as a simple function
let calculateDistanceFlow: (input: CalculateDistanceInput) => Promise<CalculateDistanceOutput>;

if (ai && tollEstimationPrompt) {
  console.log("[DistanceFlow] Genkit AI instance (ai) IS available. Defining real flow with toll estimation.");
  calculateDistanceFlow = ai.defineFlow(
    {
      name: 'calculateDistanceFlow',
      inputSchema: CalculateDistanceInputSchema,
      outputSchema: CalculateDistanceOutputSchema,
    },
    async (input: CalculateDistanceInput): Promise<CalculateDistanceOutput> => {
      console.log("[DistanceFlow] Received input:", input);
      console.log(`[DistanceFlow] Origin Address for Flow: "${input.originAddress}"`);
      console.log(`[DistanceFlow] Destination Address for Flow: "${input.destinationAddress}"`);
      let estimatedTollCostOneWay: number | null = null;

      if (!input.originAddress || !input.destinationAddress) {
        return {
          distanceKm: 0,
          status: 'ERROR_NO_ADDRESS',
          errorMessage: "Origin or destination address is missing.",
        };
      }

      const originCoords = await geocodeAddress(input.originAddress);
      if (!originCoords) {
        console.warn("[DistanceFlow] Failed to geocode origin address. Falling back to simulation.");
        return {
          distanceKm: getSimulatedDistance(),
          status: 'ERROR_GEOCODING_FAILED',
          errorMessage: "Failed to geocode origin address. Using simulated distance.",
        };
      }

      const destinationCoords = await geocodeAddress(input.destinationAddress);
      if (!destinationCoords) {
        console.warn("[DistanceFlow] Failed to geocode destination address. Falling back to simulation.");
        return {
          distanceKm: getSimulatedDistance(),
          status: 'ERROR_GEOCODING_FAILED',
          errorMessage: "Failed to geocode destination address. Using simulated distance.",
        };
      }

      try {
        const directDistanceKm = haversineDistance(originCoords, destinationCoords);
        console.log(`[DistanceFlow] Haversine (direct) distance: ${directDistanceKm.toFixed(2)} km`);
        
        const estimatedDrivingDistanceKm = directDistanceKm * 1.3; // Adjusted factor from 1.4 to 1.3
        console.log(`[DistanceFlow] Estimated driving distance (Haversine * 1.3): ${estimatedDrivingDistanceKm.toFixed(2)} km`);
        
        const finalDistanceKm = parseFloat(estimatedDrivingDistanceKm.toFixed(1));
        console.log(`[DistanceFlow] Final distance to be returned by flow (one-way): ${finalDistanceKm} km`);


        // Try to estimate toll costs using LLM
        try {
          const llmResponse = await tollEstimationPrompt({
            originAddress: input.originAddress,
            destinationAddress: input.destinationAddress,
            distanceKm: finalDistanceKm,
          });
          if (llmResponse.output && typeof llmResponse.output.estimatedTollOneWay === 'number') {
            estimatedTollCostOneWay = llmResponse.output.estimatedTollOneWay;
            console.log(`[DistanceFlow] LLM estimated one-way toll cost: ${estimatedTollCostOneWay}`);
          } else {
             console.warn("[DistanceFlow] LLM did not return a valid 'estimatedTollOneWay' number.");
          }
        } catch (llmError: any) {
          console.error("[DistanceFlow] Error during LLM toll estimation:", llmError);
          // Non-fatal error for toll estimation, proceed without it
        }

        return {
          distanceKm: finalDistanceKm,
          status: 'SUCCESS',
          estimatedTollCostByAI: estimatedTollCostOneWay,
        };
      } catch (error: any) {
        console.error("[DistanceFlow] Error during Haversine calculation or API interaction:", error);
        return {
          distanceKm: getSimulatedDistance(),
          status: 'SIMULATED',
          errorMessage: `Error during distance calculation: ${error.message}. Using simulated distance.`,
        };
      }
    }
  );
} else {
  console.warn("[DistanceFlow] Genkit AI instance (ai) or tollEstimationPrompt is NOT available. Defining dummy flow (no toll estimation).");
  calculateDistanceFlow = async (input: CalculateDistanceInput): Promise<CalculateDistanceOutput> => {
    console.warn("[DistanceFlow] Running DUMMY flow.");
    if (!input.originAddress || !input.destinationAddress) {
      return { distanceKm: 0, status: 'ERROR_NO_ADDRESS', errorMessage: "Origin or destination address is missing in dummy flow." };
    }
    // Simulate a basic calculation or error for dummy
    const simulatedDistance = getSimulatedDistance();
    const shouldSimulateError = Math.random() < 0.1; // 10% chance of simulated error
    if (shouldSimulateError) {
      return {
        distanceKm: simulatedDistance,
        status: 'SIMULATED', // Or 'ERROR_API_FAILED' if you want to simulate that
        errorMessage: 'Dummy flow simulated an API error.',
        estimatedTollCostByAI: null,
      };
    }
    return {
      distanceKm: simulatedDistance,
      status: 'SIMULATED',
      errorMessage: 'Using simulated distance from dummy flow as Genkit is not initialized.',
      estimatedTollCostByAI: null,
    };
  };
}

// Exported wrapper function
export async function calculateDistance(input: CalculateDistanceInput): Promise<CalculateDistanceOutput> {
  if (typeof calculateDistanceFlow !== 'function') {
    console.error("[DistanceFlow] calculateDistanceFlow is not defined or not a function. This indicates a severe initialization issue.");
    return {
        distanceKm: getSimulatedDistance(),
        status: 'SIMULATED',
        errorMessage: 'Critical error: calculateDistanceFlow function is undefined or not properly initialized.',
        estimatedTollCostByAI: null,
    };
  }
  try {
    return await calculateDistanceFlow(input);
  } catch (error: any) {
    console.error("[DistanceFlow] Error executing calculateDistanceFlow:", error);
    return {
      distanceKm: getSimulatedDistance(),
      status: 'SIMULATED',
      errorMessage: `Error executing flow: ${error.message}. Using simulated distance.`,
      estimatedTollCostByAI: null,
    };
  }
}
