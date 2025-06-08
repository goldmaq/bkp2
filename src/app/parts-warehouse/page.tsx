
import { AppLayout } from "@/components/layout/AppLayout";
import { PartsWarehousePageContent } from "@/components/parts-warehouse/PartsWarehousePageContent";
import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Almoxarifado de Peças | Gold Maq',
  description: 'Separação e controle de custos de peças aprovadas.',
};

export default function PartsWarehousePage() {
  return (
    <AppLayout>
      <Suspense fallback={<div>Carregando almoxarifado de peças...</div>}>
        <PartsWarehousePageContent />
      </Suspense>
    </AppLayout>
  );
}

    