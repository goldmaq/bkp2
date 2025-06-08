
import { AppLayout } from "@/components/layout/AppLayout";
import { PartsRequisitionPageContent } from "@/components/parts-requisitions/PartsRequisitionPageContent";
import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Requisições de Peças | Gold Maq',
  description: 'Criação e acompanhamento de requisições de peças pelos técnicos.',
};

export default function PartsRequisitionsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div>Carregando requisições de peças...</div>}>
        <PartsRequisitionPageContent />
      </Suspense>
    </AppLayout>
  );
}

    