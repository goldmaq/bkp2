
'use server';
/**
 * @fileOverview A Genkit flow to calculate driving distance between two addresses.
 * It attempts to use Nominatim for geocoding and Haversine for distance,
 * falling back to random simulation if API calls fail.
 *
 * - calculateDistance - A function that handles distance calculation.
 * - CalculateDistanceInput - The input type for the calculateDistance function.
 * - CalculateDistanceOutput - The return type for the calculateDistance function.
 */

import { ai } from '@/ai/genkit';
import { z, type Flow } from 'genkit'; // Ensure Flow is imported if its type is used

// Define Zod schemas based on the interfaces from types/index.ts
const CalculateDistanceInputSchema = z.object({
  originAddress: z.string().describe("The full starting address."),
  destinationAddress: z.string().describe("The full destination address."),
});
export type CalculateDistanceInput = z.infer<typeof CalculateDistanceInputSchema>;


const CalculateDistanceOutputSchema = z.object({
  distanceKm: z.number().describe("The calculated distance in kilometers."),
  status: z.enum(['SUCCESS', 'ERROR_NO_ADDRESS', 'ERROR_API_FAILED', 'SIMULATED', 'ERROR_GEOCODING_FAILED']).describe("Status of the calculation."),
  errorMessage: z.string().optional().describe("Error message if the status is an error."),
});
export type CalculateDistanceOutput = z.infer<typeof CalculateDistanceOutputSchema>;

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
  try {
    console.log(`Geocoding address: ${address} with URL: ${nominatimUrl}`);
    const response = await fetchWithTimeout(nominatimUrl, {
      headers: {
        'User-Agent': 'GoldMaqControlApp/1.0 (Firebase Studio Project; +gold-maq-control)',
      },
      timeout: 5000,
    });

    if (!response.ok) {
      console.error(`Nominatim API error for "${address}": ${response.status} ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      console.log(`Geocoded "${address}" to: lat=${lat}, lon=${lon}`);
      return { latitude: parseFloat(lat), longitude: parseFloat(lon) };
    }
    console.warn(`No geocoding results for address: ${address}`);
    return null;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`Error geocoding address "${address}": Request timed out.`);
    } else {
      console.error(`Error geocoding address "${address}":`, error);
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

// Declare calculateDistanceFlow with its type
let calculateDistanceFlow: Flow<typeof CalculateDistanceInputSchema, typeof CalculateDistanceOutputSchema>;

if (ai) {
  console.log("src/ai/flows/calculate-distance-flow.ts: Genkit AI instance (ai) IS available. Defining real flow.");
  calculateDistanceFlow = ai.defineFlow(
    {
      name: 'calculateDistanceFlow',
      inputSchema: CalculateDistanceInputSchema,
      outputSchema: CalculateDistanceOutputSchema,
    },
    async (input: CalculateDistanceInput): Promise<CalculateDistanceOutput> => {
      console.log("calculateDistanceFlow: Received input", input);

      if (!input.originAddress || !input.destinationAddress) {
        return {
          distanceKm: 0,
          status: 'ERROR_NO_ADDRESS',
          errorMessage: "Origin or destination address is missing.",
        };
      }

      const originCoords = await geocodeAddress(input.originAddress);
      if (!originCoords) {
        console.warn("calculateDistanceFlow: Failed to geocode origin address. Falling back to simulation.");
        return {
          distanceKm: getSimulatedDistance(),
          status: 'ERROR_GEOCODING_FAILED',
          errorMessage: "Failed to geocode origin address. Using simulated distance.",
        };
      }

      const destinationCoords = await geocodeAddress(input.destinationAddress);
      if (!destinationCoords) {
        console.warn("calculateDistanceFlow: Failed to geocode destination address. Falling back to simulation.");
        return {
          distanceKm: getSimulatedDistance(),
          status: 'ERROR_GEOCODING_FAILED',
          errorMessage: "Failed to geocode destination address. Using simulated distance.",
        };
      }

      try {
        const directDistanceKm = haversineDistance(originCoords, destinationCoords);
        // Estimate driving distance as 1.4 times the direct distance.
        // This is a rough heuristic and can be improved with a proper routing API.
        const estimatedDrivingDistanceKm = directDistanceKm * 1.4;

        console.log(`calculateDistanceFlow: Direct distance: ${directDistanceKm.toFixed(2)} km, Estimated driving: ${estimatedDrivingDistanceKm.toFixed(2)} km`);

        return {
          distanceKm: parseFloat(estimatedDrivingDistanceKm.toFixed(1)), // Round to one decimal place
          status: 'SUCCESS',
        };
      } catch (error: any) {
        console.error("calculateDistanceFlow: Error during Haversine calculation or API interaction:", error);
        // Fallback to simulated distance if any error occurs
        return {
          distanceKm: getSimulatedDistance(),
          status: 'SIMULATED', // Changed from ERROR_API_FAILED to SIMULATED as it's a fallback
          errorMessage: `Error during distance calculation: ${error.message}. Using simulated distance.`,
        };
      }
    }
  ); // Correctly terminate the ai.defineFlow call
} else {
  console.warn("src/ai/flows/calculate-distance-flow.ts: Genkit AI instance (ai) is NOT available. Defining dummy flow.");
}
// Exported wrapper function
export async function calculateDistance(input: CalculateDistanceInput): Promise<CalculateDistanceOutput> {
  if (typeof calculateDistanceFlow !== 'function') {
    console.error("calculateDistance Flow: calculateDistanceFlow is not defined or not a function. This indicates a severe initialization issue.");
    return {
        distanceKm: getSimulatedDistance(),
        status: 'SIMULATED',
        errorMessage: 'Critical error: calculateDistanceFlow function is undefined or not properly initialized.',
    };
  }
  try {
    return await calculateDistanceFlow(input);
  } catch (error: any) {
    console.error("Error executing calculateDistanceFlow:", error);
    return {
      distanceKm: getSimulatedDistance(),
      status: 'SIMULATED',
      errorMessage: `Error executing flow: ${error.message}. Using simulated distance.`,
    };
  }
}
