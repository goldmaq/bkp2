
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
import { z, Flow } from 'genkit';

// Define Zod schemas based on the interfaces from types/index.ts
const CalculateDistanceInputSchema = z.object({
  originAddress: z.string().describe("The full starting address."),
  destinationAddress: z.string().describe("The full destination address."),
});

const CalculateDistanceOutputSchema = z.object({
  distanceKm: z.number().describe("The calculated distance in kilometers."),
  status: z.enum(['SUCCESS', 'ERROR_NO_ADDRESS', 'ERROR_API_FAILED', 'SIMULATED', 'ERROR_GEOCODING_FAILED']).describe("Status of the calculation."),
  errorMessage: z.string().optional().describe("Error message if the status is an error."),
});

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

// Exported wrapper function
export async function calculateDistance(input: z.infer<typeof CalculateDistanceInputSchema>): Promise<z.infer<typeof CalculateDistanceOutputSchema>> {
  if (!ai || typeof calculateDistanceFlow !== 'function') {
    console.error("calculateDistance Flow: Genkit AI instance or flow is not available or not a function.");
    return {
      distanceKm: getSimulatedDistance(),
      status: 'SIMULATED',
      errorMessage: 'Genkit AI not initialized or flow not defined. Using simulated distance.',
    };
  }
  return calculateDistanceFlow(input);
}

// Genkit Flow Definition
let calculateDistanceFlow: Flow<z.infer<typeof CalculateDistanceInputSchema>, z.infer<typeof CalculateDistanceOutputSchema>>;

if (ai) {
  calculateDistanceFlow = ai.defineFlow(
    {
      name: 'calculateDistanceFlow',
      inputSchema: CalculateDistanceInputSchema,
      outputSchema: CalculateDistanceOutputSchema,
    },
    async (input: z.infer<typeof CalculateDistanceInputSchema>): Promise<z.infer<typeof CalculateDistanceOutputSchema>> => {
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
        const estimatedDrivingDistanceKm = directDistanceKm * 1.4;

        console.log(`calculateDistanceFlow: Direct distance: ${directDistanceKm.toFixed(2)} km, Estimated driving: ${estimatedDrivingDistanceKm.toFixed(2)} km`);

        return {
          distanceKm: parseFloat(estimatedDrivingDistanceKm.toFixed(1)),
          status: 'SUCCESS',
        };
      } catch (error: any) {
        console.error("calculateDistanceFlow: Error during Haversine calculation or API interaction:", error);
        return {
          distanceKm: getSimulatedDistance(),
          status: 'SIMULATED',
          errorMessage: `Error during distance calculation: ${error.message}. Using simulated distance.`,
        };
      }
    } // Closes the async arrow function (2nd arg to defineFlow)
  ); // Closes the ai.defineFlow call and the assignment to calculateDistanceFlow
} else {
  // If ai is null, define calculateDistanceFlow as a function that returns a simulated response
  calculateDistanceFlow = async (input: z.infer<typeof CalculateDistanceInputSchema>): Promise<z.infer<typeof CalculateDistanceOutputSchema>> => {
    console.warn("calculateDistanceFlow (dummy): Genkit AI not initialized. Input:", input);
    return {
      distanceKm: getSimulatedDistance(),
      status: 'SIMULATED',
      errorMessage: 'Genkit AI not initialized at flow definition. Using simulated distance.',
    };
  };
}
