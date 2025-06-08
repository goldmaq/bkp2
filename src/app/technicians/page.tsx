
import { AppLayout } from "@/components/layout/AppLayout";
import { TechniciansPageContent } from "@/components/technicians/TechniciansPageContent";
import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Técnicos / Colaboradores | Gold Maq', // Updated title
  description: 'Gerenciamento de técnicos e colaboradores da Gold Maq.', // Updated description
};

export default function TechniciansPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div>Carregando dados dos colaboradores...</div>}> {/* Updated fallback text */}
        <TechniciansPageContent />
      </Suspense>
    </AppLayout>
  );
}
