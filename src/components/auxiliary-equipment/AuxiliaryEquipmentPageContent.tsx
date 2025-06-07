
"use client";

import { useSearchParams } from "next/navigation"; // Import useSearchParams
import { AuxiliaryEquipmentClientPage } from "@/components/auxiliary-equipment/AuxiliaryEquipmentClientPage";
import { useState, useEffect } from 'react';
import type { FC } from 'react';

export const AuxiliaryEquipmentPageContent: FC = () => {
  const searchParams = useSearchParams();
  const auxEquipmentIdToOpen = searchParams ? searchParams.get('openAuxEquipmentId') : null;

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }
  return <AuxiliaryEquipmentClientPage auxEquipmentIdFromUrl={auxEquipmentIdToOpen} />;
}
