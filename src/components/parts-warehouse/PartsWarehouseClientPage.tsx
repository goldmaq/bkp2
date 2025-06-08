
"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { Archive, Loader2, User, ClipboardList, Wrench, CalendarDays, PackageSearch, AlertTriangle, Image as ImageIcon, CheckCircle, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, Timestamp } from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import type { PartsRequisition, ServiceOrder, Technician, Customer, PartsRequisitionItem } from "@/types";
import { cn, formatDateForDisplay } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";

const FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME = "partsRequisitions";
const FIRESTORE_SERVICE_ORDER_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";

interface ApprovedItem extends PartsRequisitionItem {
  requisitionId: string;
  requisitionNumber: string;
  serviceOrderId: string;
  serviceOrderNumber?: string;
  technicianId: string;
  technicianName?: string;
  customerName?: string;
  requisitionCreatedDate: string;
  requisitionStatus: PartsRequisition['status'];
}

async function fetchPartsRequisitions(): Promise<PartsRequisition[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME), orderBy("createdDate", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdDate: data.createdDate instanceof Timestamp ? data.createdDate.toDate().toISOString() : data.createdDate,
      items: Array.isArray(data.items) ? data.items.map((item: any) => ({...item, id: item.id || crypto.randomUUID() })) : [],
    } as PartsRequisition;
  });
}

async function fetchServiceOrders(): Promise<ServiceOrder[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_SERVICE_ORDER_COLLECTION_NAME), orderBy("orderNumber", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ServiceOrder));
}

async function fetchTechnicians(): Promise<Technician[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_TECHNICIAN_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Technician));
}

async function fetchCustomers(): Promise<Customer[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_CUSTOMER_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Customer));
}

export function PartsWarehouseClientPage() {
  const { toast } = useToast();

  const { data: requisitions = [], isLoading: isLoadingRequisitions, isError: isErrorRequisitions, error: errorRequisitions } = useQuery<PartsRequisition[], Error>({
    queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME],
    queryFn: fetchPartsRequisitions,
  });

  const { data: serviceOrders = [], isLoading: isLoadingServiceOrders } = useQuery<ServiceOrder[], Error>({
    queryKey: [FIRESTORE_SERVICE_ORDER_COLLECTION_NAME],
    queryFn: fetchServiceOrders,
  });

  const { data: technicians = [], isLoading: isLoadingTechnicians } = useQuery<Technician[], Error>({
    queryKey: [FIRESTORE_TECHNICIAN_COLLECTION_NAME],
    queryFn: fetchTechnicians,
  });

  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[], Error>({
    queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME],
    queryFn: fetchCustomers,
  });

  const approvedItemsForSeparation = useMemo(() => {
    const items: ApprovedItem[] = [];
    requisitions.forEach(req => {
      req.items.forEach(item => {
        // Itens aprovados ou aqueles que já estão em processo pelo almoxarifado mas não concluídos
        if (item.status === "Aprovado" || item.status === "Aguardando Compra" || item.status === "Separado") {
          const serviceOrder = serviceOrders?.find(os => os.id === req.serviceOrderId);
          const technician = technicians?.find(t => t.id === req.technicianId);
          const customer = customers?.find(c => c.id === serviceOrder?.customerId);
          items.push({
            ...item,
            requisitionId: req.id,
            requisitionNumber: req.requisitionNumber,
            serviceOrderId: req.serviceOrderId,
            serviceOrderNumber: serviceOrder?.orderNumber,
            technicianId: req.technicianId,
            technicianName: technician?.name,
            customerName: customer?.name,
            requisitionCreatedDate: req.createdDate,
            requisitionStatus: req.status,
          });
        }
      });
    });
    // Ordenar por data da requisição, mais antigas primeiro, depois por status do item
     return items.sort((a, b) => {
        const dateA = new Date(a.requisitionCreatedDate).getTime();
        const dateB = new Date(b.requisitionCreatedDate).getTime();
        if (dateA !== dateB) {
            return dateA - dateB;
        }
        // Prioritize "Aprovado" status for items if dates are same
        if (a.status === "Aprovado" && b.status !== "Aprovado") return -1;
        if (b.status === "Aprovado" && a.status !== "Aprovado") return 1;
        return 0;
    });
  }, [requisitions, serviceOrders, technicians, customers]);

  const isLoadingPageData = isLoadingRequisitions || isLoadingServiceOrders || isLoadingTechnicians || isLoadingCustomers;

  if (!db) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <PageHeader title="Erro de Conexão com Firebase" />
        <p className="text-lg text-center text-muted-foreground">
          Não foi possível conectar ao banco de dados.
        </p>
      </div>
    );
  }

  if (isLoadingPageData) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Carregando peças para separação...</p></div>;
  }

  if (isErrorRequisitions || isErrorServiceOrders || isErrorTechnicians || isErrorCustomers) {
    return <div className="text-red-500 p-4">Erro ao carregar dados do almoxarifado. Verifique o console.</div>;
  }

  return (
    <>
      <PageHeader title="Almoxarifado - Peças para Separação e Compra" />

      {approvedItemsForSeparation.length === 0 ? (
        <DataTablePlaceholder
          icon={Archive}
          title="Nenhuma Peça Aguardando Ação do Almoxarifado"
          description="Aguardando peças aprovadas na triagem ou todas já foram processadas."
          buttonLabel="Atualizar Lista"
          onButtonClick={() => {
             queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
             toast({title: "Lista Atualizada", description: "Buscando novas peças..."})
            }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {approvedItemsForSeparation.map((item) => (
            <Card key={item.id} className={cn("flex flex-col shadow-lg", {
                "border-2 border-yellow-400": item.status === "Aguardando Compra",
                "border-2 border-green-500": item.status === "Separado",
                 "border-blue-400": item.status === "Aprovado", // Default for approved
            })}>
              <CardHeader>
                <CardTitle className="font-headline text-lg text-primary">{item.partName}</CardTitle>
                <CardDescription>
                  Req: {item.requisitionNumber} | OS: {item.serviceOrderNumber || item.serviceOrderId}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-2 text-sm">
                <p className="flex items-center">
                  <PackageSearch className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-muted-foreground mr-1">Qtd Solicitada:</span>
                  {item.quantity}
                </p>
                <p className="flex items-center">
                  <CalendarDays className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-muted-foreground mr-1">Data Req.:</span>
                  {formatDateForDisplay(item.requisitionCreatedDate)}
                </p>
                <p className="flex items-center">
                  <User className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-muted-foreground mr-1">Técnico:</span>
                  {item.technicianName || item.technicianId}
                </p>
                {item.customerName && (
                    <p className="flex items-center">
                        <User className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium text-muted-foreground mr-1">Cliente OS:</span>
                        {item.customerName}
                    </p>
                )}
                 {item.notes && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Obs. Técnico:</span> {item.notes}
                  </p>
                )}
                {item.triageNotes && (
                  <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                    <span className="font-medium">Obs. Triagem:</span> {item.triageNotes}
                  </p>
                )}
                {item.imageUrl && (
                  <div className="mt-2">
                    <Link href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block group">
                      <Image src={item.imageUrl} alt={`Imagem de ${item.partName}`} width={60} height={60} className="rounded object-cover aspect-square group-hover:opacity-80 transition-opacity" data-ai-hint="part image"/>
                      <span className="text-xs text-primary hover:underline block mt-1 group-hover:text-primary/80 transition-colors">Ver Imagem</span>
                    </Link>
                  </div>
                )}
                <div className="mt-3 pt-2 border-t">
                    <p className="flex items-center font-semibold">
                        {item.status === "Aprovado" && <CheckCircle className="mr-2 h-4 w-4 text-blue-500" />}
                        {item.status === "Aguardando Compra" && <ShoppingCart className="mr-2 h-4 w-4 text-yellow-500" />}
                        {item.status === "Separado" && <CheckCircle className="mr-2 h-4 w-4 text-green-500" />}
                         <span className="font-medium text-muted-foreground mr-1">Status Item:</span>
                        <span className={cn({
                            "text-blue-600": item.status === "Aprovado",
                            "text-yellow-600": item.status === "Aguardando Compra",
                            "text-green-600": item.status === "Separado",
                        })}>{item.status}</span>
                    </p>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-4">
                {/* TODO: Ações do Almoxarifado (Marcar como Separado, Aguardando Compra, Custo) */}
                 <div className="flex gap-2 w-full">
                    {item.status === "Aprovado" && (
                        <>
                            <Button size="sm" variant="outline" className="flex-1 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={() => console.log("Marcar como Separado:", item.id)}>
                                <CheckCircle className="mr-1.5 h-4 w-4"/> Separado
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 border-yellow-500 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700" onClick={() => console.log("Marcar como Aguardando Compra:", item.id)}>
                                <ShoppingCart className="mr-1.5 h-4 w-4"/> Aguardar Compra
                            </Button>
                        </>
                    )}
                    {item.status === "Aguardando Compra" && (
                         <Button size="sm" variant="outline" className="flex-1 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={() => console.log("Peça Chegou (Separado):", item.id)}>
                            <CheckCircle className="mr-1.5 h-4 w-4"/> Peça Chegou (Separar)
                        </Button>
                    )}
                 </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
