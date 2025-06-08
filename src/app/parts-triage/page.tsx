
import { AppLayout } from "@/components/layout/AppLayout";
import { PartsTriagePageContent } from "@/components/parts-triage/PartsTriagePageContent";
import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Triagem de OS e Peças | Gold Maq', // MODIFICADO
  description: 'Aprovação ou recusa de peças solicitadas e processamento de orçamentos aprovados para geração de OS.', // MODIFICADO
};

export default function PartsTriagePage() {
  return (
    <AppLayout>
      <Suspense fallback={<div>Carregando dados para triagem...</div>}> {/* MODIFICADO */}
        <PartsTriagePageContent />
      </Suspense>
    </AppLayout>
  );
}
