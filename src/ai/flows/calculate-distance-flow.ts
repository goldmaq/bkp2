
'use server';
/**
 * @fileOverview A Genkit flow to calculate (currently simulate) driving distance between two addresses.
 *
 * - calculateDistance - A function that simulates distance calculation.
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
  status: z.enum(['SUCCESS', 'ERROR_NO_ADDRESS', 'ERROR_API_FAILED', 'SIMULATED']).describe("Status of the calculation."),
  errorMessage: z.string().optional().describe("Error message if the status is an error."),
});


// Exported wrapper function
export async function calculateDistance(input: CalculateDistanceInput): Promise<CalculateDistanceOutput> {
  if (!ai) {
    console.error("calculateDistance Flow: Genkit AI instance is not available.");
    return { 
        distanceKm: 0, 
        status: 'ERROR_API_FAILED', 
        errorMessage: 'Genkit AI not initialized.' 
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

    // Simulate API call and distance calculation
    // In a real scenario, you would call a service like Google Maps Directions API here.
    // For now, return a random distance for demonstration.
    const simulatedDistance = Math.floor(Math.random() * (250 - 5 + 1)) + 5; // Random distance between 5km and 250km

    console.log("calculateDistanceFlow: Simulated distance (one way):", simulatedDistance);

    // This flow returns ONE-WAY distance. The caller should double it for round trip.
    return {
      distanceKm: simulatedDistance,
      status: 'SIMULATED', // Indicate that this is a simulated value
    };
  }
);
