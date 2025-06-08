
import { AppLayout } from "@/components/layout/AppLayout";
import { BudgetsPageContent } from "@/components/budgets/BudgetsPageContent";
import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Orçamentos | Gold Maq',
  description: 'Gerenciamento de orçamentos da Gold Maq.',
};

export default function BudgetsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div>Carregando orçamentos...</div>}>
        <BudgetsPageContent />
      </Suspense>
    </AppLayout>
  );
}
