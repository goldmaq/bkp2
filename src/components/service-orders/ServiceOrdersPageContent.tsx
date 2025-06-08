
"use client";

import { ServiceOrderClientPage } from "@/components/service-orders/ServiceOrderClientPage";
import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { useSearchParams } from "next/navigation"; // Import useSearchParams

export const ServiceOrdersPageContent: FC = () => {
  const [isClient, setIsClient] = useState(false);
  const searchParams = useSearchParams(); // Get searchParams
  const orderIdToOpen = searchParams ? searchParams.get('openServiceOrderId') : null; // Get the specific param

  useEffect(() => {
    // This effect runs only on the client, after initial hydration
    setIsClient(true);
  }, []);

  if (!isClient) {
    // The Suspense fallback in page.tsx will be shown during SSR and initial client render
    return null;
  }
  // ServiceOrderClientPage will only render on the client after isClient becomes true
  // Pass the orderIdToOpen to the client page
  return <ServiceOrderClientPage serviceOrderIdFromUrl={orderIdToOpen} />;
}

