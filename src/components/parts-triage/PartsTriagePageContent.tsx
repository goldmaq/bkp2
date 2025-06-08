
"use client";

import { PartsTriageClientPage } from "@/components/parts-triage/PartsTriageClientPage";
import { useState, useEffect } from 'react';
import type { FC } from 'react';

export const PartsTriagePageContent: FC = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }
  return <PartsTriageClientPage />;
}

    