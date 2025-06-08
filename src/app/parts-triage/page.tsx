
import { AppLayout } from "@/components/layout/AppLayout";
import { PartsTriagePageContent } from "@/components/parts-triage/PartsTriagePageContent";
import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Triagem de Peças | Gold Maq',
  description: 'Aprovação ou recusa de peças solicitadas pelos técnicos.',
};

export default function PartsTriagePage() {
  return (
    <AppLayout>
      <Suspense fallback={<div>Carregando triagem de peças...</div>}>
        <PartsTriagePageContent />
      </Suspense>
    </AppLayout>
  );
}

    