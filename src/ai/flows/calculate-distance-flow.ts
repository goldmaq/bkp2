
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
import { z } from 'genkit';
import type { CalculateDistanceInput, CalculateDistanceOutput } from '@/types';

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

// Helper function to geocode an address using Nominatim
async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  try {
    console.log(`Geocoding address: ${address} with URL: ${nominatimUrl}`);
    const response = await fetch(nominatimUrl, {
      headers: {
        // IMPORTANT: Provide a User-Agent as per Nominatim's usage policy
        'User-Agent': 'GoldMaqControlApp/1.0 (Firebase Studio Project; +gold-maq-control)',
      },
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
  } catch (error) {
    console.error(`Error geocoding address "${address}":`, error);
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

// Fallback simulated distance
function getSimulatedDistance(): number {
  return Math.floor(Math.random() * (250 - 5 + 1)) + 5; // Random distance between 5km and 250km
}

// Exported wrapper function
export async function calculateDistance(input: CalculateDistanceInput): Promise<CalculateDistanceOutput> {
  if (!ai) {
    console.error("calculateDistance Flow: Genkit AI instance is not available.");
    return {
      distanceKm: getSimulatedDistance(), // Provide a simulated distance on Genkit error
      status: 'SIMULATED',
      errorMessage: 'Genkit AI not initialized. Using simulated distance.',
    };
  }
  return calculateDistanceFlow(input);
}

// Genkit Flow Definition
const calculateDistanceFlow = ai.defineFlow(
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
        status: 'SIMULATED',
        errorMessage: "Failed to geocode origin address. Using simulated distance.",
      };
    }

    const destinationCoords = await geocodeAddress(input.destinationAddress);
    if (!destinationCoords) {
      console.warn("calculateDistanceFlow: Failed to geocode destination address. Falling back to simulation.");
      return {
        distanceKm: getSimulatedDistance(),
        status: 'SIMULATED',
        errorMessage: "Failed to geocode destination address. Using simulated distance.",
      };
    }

    try {
      const directDistanceKm = haversineDistance(originCoords, destinationCoords);
      // Apply a correction factor to approximate driving distance (e.g., 1.4)
      // This is a rough estimate and can vary greatly.
      const estimatedDrivingDistanceKm = directDistanceKm * 1.4;

      console.log(`calculateDistanceFlow: Direct distance: ${directDistanceKm.toFixed(2)} km, Estimated driving: ${estimatedDrivingDistanceKm.toFixed(2)} km`);

      // This flow returns ONE-WAY distance. The caller should double it for round trip.
      return {
        distanceKm: parseFloat(estimatedDrivingDistanceKm.toFixed(1)),
        status: 'SUCCESS',
      };
    } catch (error) {
      console.error("calculateDistanceFlow: Error during Haversine calculation or API interaction:", error);
      return {
        distanceKm: getSimulatedDistance(),
        status: 'SIMULATED',
        errorMessage: "Error during distance calculation. Using simulated distance.",
      };
    }
  }
);
