
import { AppLayout } from "@/components/layout/AppLayout";
import { PartsTriagePageContent } from "@/components/parts-triage/PartsTriagePageContent";
import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Triagem de Ordens e Peças | Gold Maq', // MODIFICADO
  description: 'Aprovação ou recusa de peças solicitadas e processamento de orçamentos aprovados para geração de OS.',
};

export default function PartsTriagePage() {
  return (
    <AppLayout>
      <Suspense fallback={<div>Carregando dados para triagem...</div>}>
        <PartsTriagePageContent />
      </Suspense>
    </AppLayout>
  );
}
