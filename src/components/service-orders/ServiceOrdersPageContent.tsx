
"use client";

import { ServiceOrderClientPage } from "@/components/service-orders/ServiceOrderClientPage";
import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { useSearchParams } from "next/navigation"; 
import { useQuery } from "@tanstack/react-query";
import type { Budget, Customer, Maquina } from "@/types";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { formatCurrency, toTitleCase } from "@/lib/utils";


const FIRESTORE_BUDGET_COLLECTION_NAME = "budgets";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";
const FIRESTORE_EQUIPMENT_COLLECTION_NAME = "equipamentos";


async function fetchBudgetById(budgetId: string): Promise<Budget | null> {
  if (!db || !budgetId) return null;
  const docRef = doc(db, FIRESTORE_BUDGET_COLLECTION_NAME, budgetId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as Budget) : null;
}
async function fetchCustomerById(customerId: string): Promise<Customer | null> {
  if (!db || !customerId) return null;
  const docRef = doc(db, FIRESTORE_CUSTOMER_COLLECTION_NAME, customerId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as Customer) : null;
}
async function fetchEquipmentById(equipmentId: string): Promise<Maquina | null> {
  if (!db || !equipmentId) return null;
  const docRef = doc(db, FIRESTORE_EQUIPMENT_COLLECTION_NAME, equipmentId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as Maquina) : null;
}


export const ServiceOrdersPageContent: FC = () => {
  const [isClient, setIsClient] = useState(false);
  const searchParams = useSearchParams(); 
  const orderIdToOpen = searchParams ? searchParams.get('openServiceOrderId') : null;
  const action = searchParams ? searchParams.get('action') : null;
  const budgetIdFromUrl = searchParams ? searchParams.get('fromBudgetId') : null;

  const { data: budgetToPrefill, isLoading: isLoadingBudget } = useQuery<Budget | null, Error>({
    queryKey: [FIRESTORE_BUDGET_COLLECTION_NAME, budgetIdFromUrl],
    queryFn: () => budgetIdFromUrl ? fetchBudgetById(budgetIdFromUrl) : Promise.resolve(null),
    enabled: !!budgetIdFromUrl && action === 'create',
  });

  const customerIdForBudget = budgetToPrefill?.customerId;
  const equipmentIdForBudget = budgetToPrefill?.equipmentId;

  const { data: customerForBudget, isLoading: isLoadingCustomerForBudget } = useQuery<Customer | null, Error>({
      queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME, customerIdForBudget],
      queryFn: () => customerIdForBudget ? fetchCustomerById(customerIdForBudget) : Promise.resolve(null),
      enabled: !!customerIdForBudget,
  });

  const { data: equipmentForBudget, isLoading: isLoadingEquipmentForBudget } = useQuery<Maquina | null, Error>({
      queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME, equipmentIdForBudget],
      queryFn: () => equipmentIdForBudget ? fetchEquipmentById(equipmentIdForBudget) : Promise.resolve(null),
      enabled: !!equipmentIdForBudget,
  });


  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  if (action === 'create' && budgetIdFromUrl && (isLoadingBudget || isLoadingCustomerForBudget || isLoadingEquipmentForBudget)) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Carregando dados do orçamento para nova OS...</p>
      </div>
    );
  }
  
  let initialDataForOS;
  if (action === 'create' && budgetToPrefill && customerForBudget && equipmentForBudget) {
      const budgetItemsDescription = budgetToPrefill.items
        .map(item => `- ${item.description} (Qtd: ${item.quantity}, Valor Unit.: ${formatCurrency(item.unitPrice)}, Subtotal: ${formatCurrency(item.quantity * item.unitPrice)})`)
        .join('\n');
      
      const description = `Serviço referente ao Orçamento Nº ${budgetToPrefill.budgetNumber}.\n\nCliente: ${toTitleCase(customerForBudget.name)}\nMáquina: ${toTitleCase(equipmentForBudget.brand)} ${toTitleCase(equipmentForBudget.model)} (Chassi: ${equipmentForBudget.chassisNumber || 'N/A'})\n\nItens do Orçamento:\n${budgetItemsDescription}\n\nValor Total do Orçamento: ${formatCurrency(budgetToPrefill.totalAmount)}`;

    initialDataForOS = {
      customerId: budgetToPrefill.customerId,
      equipmentId: budgetToPrefill.equipmentId,
      description: description,
      // Poderia adicionar budget.notes para as notas da OS também, ou o técnico decide.
    };
  }

  return <ServiceOrderClientPage 
            serviceOrderIdFromUrl={orderIdToOpen} 
            initialDataFromBudget={initialDataForOS} 
         />;
}
