
"use client";

import { PartsWarehouseClientPage } from "@/components/parts-warehouse/PartsWarehouseClientPage";
import { useState, useEffect } from 'react';
import type { FC } from 'react';

export const PartsWarehousePageContent: FC = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }
  return <PartsWarehouseClientPage />;
}

    