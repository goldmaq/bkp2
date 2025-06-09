
"use client";

import { useSearchParams } from "next/navigation";
import { MaquinasClientPage } from "@/components/maquinas/MaquinasClientPage"; 
import type { FC } from "react";
import { useState, useEffect } from "react"; 

export const MaquinasPageContent: FC = () => { 
  const searchParams = useSearchParams();
  const maquinaIdToOpen = searchParams ? searchParams.get('openMaquinaId') : null;
  const initialStatusFilterFromUrl = searchParams ? searchParams.get('status') : null;
  
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; 
  }
  
  return <MaquinasClientPage maquinaIdFromUrl={maquinaIdToOpen} initialStatusFilter={initialStatusFilterFromUrl} />; 
};
