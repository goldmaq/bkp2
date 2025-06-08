
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type * as z from "zod";
import { ClipboardCheck, User, Construction, CalendarDays, Loader2, AlertTriangle, FileText, Wrench, Image as ImageIcon, ThumbsUp, Ban, Eye, MessageSquare } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
// FormModal might not be needed if using AlertDialog for simple notes
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, query, orderBy, Timestamp, updateDoc, runTransaction } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PartsRequisition, ServiceOrder, Technician, Customer, PartsRequisitionItem, PartsRequisitionItemStatusType, PartsRequisitionStatusType } from "@/types";
import { cn, formatDateForDisplay } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";

const FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME = "partsRequisitions";
const FIRESTORE_SERVICE_ORDER_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";

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
    if (!db) {
      console.error("fetchCustomers: Firebase DB is not available.");
      throw new Error("Firebase DB is not available");
    }
    const q = query(collection(db!, FIRESTORE_CUSTOMER_COLLECTION_NAME), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Customer));
}

export function PartsTriageClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isItemStatusModalOpen, setIsItemStatusModalOpen] = useState(false);
  const [currentTriageData, setCurrentTriageData] = useState<{
    requisitionId: string;
    requisitionNumber: string;
    itemId: string;
    partName: string;
    newStatus: PartsRequisitionItemStatusType;
    currentNotes: string | null | undefined;
  } | null>(null);
  const [triageNotes, setTriageNotes] = useState("");


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

  const requisitionsForTriage = useMemo(() => {
    return requisitions.filter(req =>
      req.status !== "Cancelada" && req.status !== "Atendida Totalmente" &&
      req.items.some(item => item.status === "Pendente Aprovação")
    );
  }, [requisitions]);

  const updatePartItemStatusMutation = useMutation({
    mutationFn: async (data: {
      requisitionId: string;
      itemId: string;
      newStatus: PartsRequisitionItemStatusType;
      notes?: string | null;
    }) => {
      if (!db) throw new Error("Firebase DB is not available.");
      const reqRef = doc(db, FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME, data.requisitionId);

      await runTransaction(db, async (transaction) => {
        const reqDoc = await transaction.get(reqRef);
        if (!reqDoc.exists()) {
          throw new Error("Requisição não encontrada.");
        }

        const currentRequisition = reqDoc.data() as PartsRequisition;
        const itemIndex = currentRequisition.items.findIndex(item => item.id === data.itemId);

        if (itemIndex === -1) {
          throw new Error("Item da requisição não encontrado.");
        }

        const updatedItems = [...currentRequisition.items];
        updatedItems[itemIndex] = {
          ...updatedItems[itemIndex],
          status: data.newStatus,
          triageNotes: data.notes || updatedItems[itemIndex].triageNotes || null,
        };

        // Determine overall requisition status
        let allApproved = true;
        let someApproved = false;
        let allTriaged = true;

        updatedItems.forEach(item => {
          if (item.status === "Pendente Aprovação") {
            allTriaged = false;
            allApproved = false;
          } else if (item.status === "Aprovado" || item.status === "Aguardando Compra" || item.status === "Separado" || item.status === "Entregue") {
            someApproved = true;
          } else if (item.status === "Recusado") {
            allApproved = false;
          }
        });
        
        let newRequisitionStatus: PartsRequisitionStatusType = currentRequisition.status;
        if (allTriaged) {
            if (allApproved && someApproved) { // All items triaged and all of them are approved (or further)
                newRequisitionStatus = "Triagem Realizada"; // Could also be more specific like "Totalmente Aprovada"
            } else if (someApproved) { // All items triaged, some approved, some might be refused
                newRequisitionStatus = "Triagem Realizada"; // Or "Parcialmente Aprovada"
            } else { // All items triaged, but none approved (all refused)
                newRequisitionStatus = "Triagem Realizada"; // Or "Totalmente Recusada"
            }
        } else {
            newRequisitionStatus = "Pendente"; // Still items pending triage
        }


        transaction.update(reqRef, { items: updatedItems, status: newRequisitionStatus });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
      toast({ title: "Status do Item Atualizado", description: "O status do item foi atualizado com sucesso." });
      setIsItemStatusModalOpen(false);
      setCurrentTriageData(null);
      setTriageNotes("");
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Atualizar Status", description: error.message, variant: "destructive" });
    }
  });


  const handleOpenTriageModal = (
    requisitionId: string,
    requisitionNumber: string,
    item: PartsRequisitionItem,
    newStatus: PartsRequisitionItemStatusType
  ) => {
    setCurrentTriageData({
      requisitionId,
      requisitionNumber,
      itemId: item.id,
      partName: item.partName,
      newStatus,
      currentNotes: item.triageNotes,
    });
    setTriageNotes(item.triageNotes || "");
    setIsItemStatusModalOpen(true);
  };

  const handleConfirmTriage = () => {
    if (currentTriageData) {
      updatePartItemStatusMutation.mutate({
        requisitionId: currentTriageData.requisitionId,
        itemId: currentTriageData.itemId,
        newStatus: currentTriageData.newStatus,
        notes: triageNotes.trim() || null,
      });
    }
  };

  const isLoadingPageData = isLoadingRequisitions || isLoadingServiceOrders || isLoadingTechnicians || isLoadingCustomers;
  const isMutating = updatePartItemStatusMutation.isPending;

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

  if (isLoadingPageData && !isItemStatusModalOpen) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Carregando dados de triagem...</p></div>;
  }

  if (isErrorRequisitions || !Array.isArray(requisitions)) {
    return <div className="text-red-500 p-4">Erro ao carregar requisições para triagem: {errorRequisitions?.message || "Formato de dados inválido."}</div>;
  }

  return (
    <>
      <PageHeader title="Triagem de Requisições de Peças" />

      {requisitionsForTriage.length === 0 && !isLoadingRequisitions ? (
        <DataTablePlaceholder
          icon={ClipboardCheck}
          title="Nenhuma Requisição Pendente de Triagem"
          description="Aguardando novas requisições de peças dos técnicos ou todas já foram triadas."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requisitionsForTriage.map((req) => {
            const serviceOrder = serviceOrders?.find(os => os.id === req.serviceOrderId);
            const technician = technicians?.find(t => t.id === req.technicianId);
            const customer = customers?.find(c => c.id === serviceOrder?.customerId);
            return (
              <Card key={req.id} className="flex flex-col shadow-lg">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="font-headline text-xl text-primary">Requisição: {req.requisitionNumber}</CardTitle>
                     <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", {
                      "bg-yellow-100 text-yellow-700": req.status === "Pendente",
                      "bg-blue-100 text-blue-700": req.status === "Triagem Realizada",
                      "bg-orange-100 text-orange-700": req.status === "Atendida Parcialmente",
                      "bg-green-100 text-green-700": req.status === "Atendida Totalmente",
                      "bg-red-100 text-red-700": req.status === "Cancelada",
                    })}>
                      {req.status}
                    </span>
                  </div>
                  <CardDescription>
                    OS: {serviceOrder?.orderNumber || req.serviceOrderId} | Cliente: {customer?.name || 'N/A'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-3 text-sm">
                  <p className="flex items-center">
                    <User className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Técnico:</span>
                    {technician?.name || req.technicianId}
                  </p>
                  <p className="flex items-center">
                    <CalendarDays className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Data:</span>
                    {formatDateForDisplay(req.createdDate)}
                  </p>
                  {req.generalNotes && (
                    <p className="flex items-start">
                        <FileText className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium text-muted-foreground mr-1">Obs. Geral da Req.:</span>
                        <span className="whitespace-pre-wrap break-words">{req.generalNotes}</span>
                    </p>
                  )}
                  <div>
                    <h4 className="text-sm font-semibold mb-1 mt-2">Itens para Triagem:</h4>
                    <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
                      {req.items.map(item => (
                        <li key={item.id} className="p-3 border rounded-md bg-card hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-base">{item.partName} (Qtd: {item.quantity})</span>
                            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-semibold", {
                                "bg-yellow-200 text-yellow-800": item.status === "Pendente Aprovação",
                                "bg-green-200 text-green-800": item.status === "Aprovado" || item.status === "Separado" || item.status === "Entregue",
                                "bg-red-200 text-red-800": item.status === "Recusado",
                                "bg-blue-200 text-blue-800": item.status === "Aguardando Compra",
                            })}>
                                {item.status}
                            </span>
                          </div>
                          {item.notes && <p className="text-xs text-muted-foreground">Obs. Técnico: {item.notes}</p>}
                          {item.imageUrl && (
                            <div className="mt-1.5">
                                <Link href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block group">
                                    <Image src={item.imageUrl} alt={`Imagem de ${item.partName}`} width={60} height={60} className="rounded object-cover aspect-square group-hover:opacity-80 transition-opacity" data-ai-hint="part image"/>
                                    <span className="text-xs text-primary hover:underline block mt-1 group-hover:text-primary/80 transition-colors">Ver Imagem</span>
                                </Link>
                            </div>
                          )}
                          {item.status === "Pendente Aprovação" && (
                             <div className="mt-2 flex gap-2">
                                <Button size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700 flex-1" onClick={(e) => { e.stopPropagation(); handleOpenTriageModal(req.id, req.requisitionNumber, item, "Aprovado");}} disabled={isMutating}>
                                    <ThumbsUp className="mr-1.5 h-3.5 w-3.5"/> Aprovar
                                </Button>
                                <Button size="sm" variant="outline" className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 flex-1" onClick={(e) => { e.stopPropagation(); handleOpenTriageModal(req.id, req.requisitionNumber, item, "Recusado");}} disabled={isMutating}>
                                   <Ban className="mr-1.5 h-3.5 w-3.5"/> Recusar
                                </Button>
                            </div>
                          )}
                           {item.triageNotes && (
                            <p className="text-xs text-muted-foreground mt-1.5 border-t pt-1.5">
                                <span className="font-medium">Nota Triagem:</span> {item.triageNotes}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-4"></CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={isItemStatusModalOpen} onOpenChange={setIsItemStatusModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar Triagem: {currentTriageData?.partName} (Req: {currentTriageData?.requisitionNumber})
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a marcar este item como "{currentTriageData?.newStatus}".
              Adicione uma observação para esta triagem (opcional).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="triage-notes" className="text-sm font-medium">
              Observações da Triagem (Opcional)
            </Label>
            <Textarea
              id="triage-notes"
              value={triageNotes}
              onChange={(e) => setTriageNotes(e.target.value)}
              placeholder="Ex: Peça disponível em estoque, Necessário encomendar..."
              rows={3}
            />
            {updatePartItemStatusMutation.isError && (
                <p className="text-sm text-destructive mt-2">
                    Erro: {(updatePartItemStatusMutation.error as Error)?.message || "Não foi possível atualizar o item."}
                </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsItemStatusModalOpen(false); setCurrentTriageData(null); setTriageNotes("");}} disabled={isMutating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
                onClick={handleConfirmTriage}
                disabled={isMutating}
                className={cn(
                    currentTriageData?.newStatus === "Aprovado" && buttonVariants({className: "bg-green-600 hover:bg-green-700"}),
                    currentTriageData?.newStatus === "Recusado" && buttonVariants({variant: "destructive"}),
                )}
            >
              {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : (currentTriageData?.newStatus === "Aprovado" ? <ThumbsUp className="mr-2 h-4 w-4"/> : <Ban className="mr-2 h-4 w-4"/>)}
              Confirmar {currentTriageData?.newStatus}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

    