
'use server';
/**
 * @fileOverview A Genkit flow to calculate driving distance between two addresses
 * using the Google Maps Directions API and indicate if tolls are likely.
 *
 * - calculateDistance - A function that handles distance calculation and toll indication.
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
  status: z.enum(['SUCCESS', 'SIMULATED', 'ERROR_NO_ADDRESS', 'ERROR_GOOGLE_API_FAILED', 'ERROR_GOOGLE_API_KEY_MISSING', 'ERROR_NO_ROUTE_FOUND']).describe("Status of the calculation."),
  errorMessage: z.string().optional().describe("Error message if the status is an error."),
  estimatedTollCostByAI: z.number().optional().nullable().describe("Este campo não é mais preenchido. Será sempre null."),
  googleMapsApiIndicstedTolls: z.boolean().optional().describe("Indicates if Google Maps API suggested the route has tolls.")
});
export type CalculateDistanceOutput = z.infer<typeof CalculateDistanceOutputSchema>;

// O prompt de estimativa de pedágio e seus esquemas foram removidos, pois não serão mais usados.

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
    if (leg.tolls_info || (leg as any).tolls ) { // Considera a propriedade 'tolls' que pode existir
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

if (ai) { // Verifica se a instância 'ai' está disponível (Genkit inicializado)
  console.log("[DistanceFlow] Genkit AI instance (ai) IS available. Defining real flow with Google Maps (toll cost estimation removed).");
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
          estimatedTollCostByAI: null, // Explicitamente null
        };
      }

      const routeResult = await fetchRouteFromGoogleMaps(input.originAddress, input.destinationAddress);

      if ('error' in routeResult) {
        return {
          distanceKm: 0,
          status: routeResult.status,
          errorMessage: routeResult.error,
          estimatedTollCostByAI: null, // Explicitamente null
        };
      }

      const { distanceKm, googleIndicatesTolls } = routeResult;
      
      console.log(`[DistanceFlow] Google Maps API indicated tolls: ${googleIndicatesTolls}`);
      
      return {
        distanceKm: distanceKm,
        status: 'SUCCESS',
        estimatedTollCostByAI: null, // Estimativa de pedágio por IA removida, sempre null
        googleMapsApiIndicstedTolls: googleIndicatesTolls,
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
    return {
      distanceKm: simulatedDistance,
      status: 'SIMULATED',
      errorMessage: 'Dummy flow: Simulating API key missing, as Genkit/Google Maps is not fully initialized.',
      estimatedTollCostByAI: null, // Estimativa de pedágio por IA removida, sempre null
      googleMapsApiIndicstedTolls: Math.random() > 0.5,
    };
  };
}

/**
 * Calculates the driving distance between two addresses and indicates if tolls are likely.
 * This function wraps the Genkit flow `calculateDistanceFlow`.
 *
 * @param input - An object containing the origin and destination addresses.
 * @returns A promise that resolves to an object with distance, status, and toll indication.
 */
export async function calculateDistance(input: CalculateDistanceInput): Promise<CalculateDistanceOutput> {
  if (typeof calculateDistanceFlow !== 'function') {
    console.error("[DistanceFlow] calculateDistanceFlow is not defined or not a function. Critical initialization issue.");
    return {
        distanceKm: Math.floor(Math.random() * 450) + 50, // Simulação
        status: 'ERROR_GOOGLE_API_FAILED', // Indica um erro genérico na API
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
      distanceKm: Math.floor(Math.random() * 450) + 50, // Simulação
      status: 'ERROR_GOOGLE_API_FAILED', // Indica um erro genérico na API
      errorMessage: `Error executing flow: ${error.message}. Using simulated distance.`,
      estimatedTollCostByAI: null,
      googleMapsApiIndicstedTolls: undefined,
    };
  }
}

