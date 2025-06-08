
"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PlusCircle, Wrench } from "lucide-react";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";

export function PartsRequisitionClientPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // TODO: Adicionar estados e lógica para buscar e listar requisições

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  // Exemplo de estado para lista (será substituído por dados do Firebase)
  const requisitions: any[] = []; // Substituir 'any' pelo tipo PartsRequisition[]

  return (
    <>
      <PageHeader
        title="Minhas Requisições de Peças"
        actions={
          <Button onClick={openModal} className="bg-primary hover:bg-primary/90">
            <PlusCircle className="mr-2 h-4 w-4" /> Nova Requisição
          </Button>
        }
      />

      {requisitions.length === 0 ? (
        <DataTablePlaceholder
          icon={Wrench}
          title="Nenhuma Requisição de Peças"
          description="Crie sua primeira requisição de peças para uma Ordem de Serviço."
          buttonLabel="Criar Nova Requisição"
          onButtonClick={openModal}
        />
      ) : (
        <div className="space-y-4">
          {/* TODO: Listar requisições aqui */}
          <p>Listagem de requisições aparecerá aqui...</p>
        </div>
      )}

      {/* TODO: Adicionar FormModal para criar/editar requisição */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card p-6 rounded-lg shadow-xl w-full max-w-2xl">
            <h2 className="text-xl font-semibold mb-4">Nova Requisição de Peças</h2>
            <p>Formulário de nova requisição aqui...</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeModal}>Cancelar</Button>
              <Button className="bg-primary hover:bg-primary/80">Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

    