
"use client";

import { PartsRequisitionClientPage } from "@/components/parts-requisitions/PartsRequisitionClientPage";
import { useState, useEffect } from 'react';
import type { FC } from 'react';

export const PartsRequisitionPageContent: FC = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }
  return <PartsRequisitionClientPage />;
}

    