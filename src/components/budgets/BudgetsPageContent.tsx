
"use client";

import { BudgetClientPage } from "@/components/budgets/BudgetClientPage";
import { useState, useEffect } from 'react';
import type { FC } from 'react';

export const BudgetsPageContent: FC = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }
  return <BudgetClientPage />;
}
