
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type * as z from "zod";
import { ClipboardCheck, User, Construction, CalendarDays, Loader2, AlertTriangle, FileText, Wrench, Image as ImageIcon, ThumbsUp, Ban, Eye, MessageSquare, Layers, Tag, FileSignature, DollarSign, Users as UsersIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, query, orderBy, Timestamp, updateDoc, runTransaction } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PartsRequisition, ServiceOrder, Technician, Customer, PartsRequisitionItem, PartsRequisitionItemStatusType, PartsRequisitionStatusType, Maquina, Budget } from "@/types";
import { cn, formatDateForDisplay, toTitleCase, parseNumericToNullOrNumber, formatCurrency } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME = "partsRequisitions";
const FIRESTORE_SERVICE_ORDER_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";
const FIRESTORE_EQUIPMENT_COLLECTION_NAME = "equipamentos";
const FIRESTORE_BUDGET_COLLECTION_NAME = "budgets";

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

async function fetchEquipmentList(): Promise<Maquina[]> {
  if (!db) {
    throw new Error("Firebase Firestore connection not available.");
  }
  const q = query(collection(db!, FIRESTORE_EQUIPMENT_COLLECTION_NAME), orderBy("brand", "asc"), orderBy("model", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      brand: data.brand || "Marca Desconhecida",
      model: data.model || "Modelo Desconhecido",
      chassisNumber: data.chassisNumber || "N/A",
      equipmentType: data.equipmentType,
      manufactureYear: parseNumericToNullOrNumber(data.manufactureYear),
      operationalStatus: data.operationalStatus,
      customerId: data.customerId || null,
      ownerReference: data.ownerReference || null,
    } as Maquina;
  });
}

async function fetchBudgets(): Promise<Budget[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_BUDGET_COLLECTION_NAME), orderBy("createdDate", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdDate: data.createdDate instanceof Timestamp ? data.createdDate.toDate().toISOString() : data.createdDate,
      validUntilDate: data.validUntilDate instanceof Timestamp ? data.validUntilDate.toDate().toISOString() : data.validUntilDate,
      items: Array.isArray(data.items) ? data.items.map((item: any) => ({...item, id: item.id || crypto.randomUUID() })) : [],
    } as Budget;
  });
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


  const { data: requisitions = [], isLoading: isLoadingRequisitions, isError: isErrorRequisitions, error: errorRequisitionsDataAll } = useQuery<PartsRequisition[], Error>({
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

  const { data: equipmentList = [], isLoading: isLoadingEquipment } = useQuery<Maquina[], Error>({
    queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME],
    queryFn: fetchEquipmentList,
  });

  const { data: budgets = [], isLoading: isLoadingBudgets, isError: isErrorBudgets, error: errorBudgetsData } = useQuery<Budget[], Error>({
    queryKey: [FIRESTORE_BUDGET_COLLECTION_NAME],
    queryFn: fetchBudgets,
  });

  const requisitionsForTriage = useMemo(() => {
    return requisitions.filter(req =>
      req.status === "Pendente" &&
      req.items.some(item => item.status === "Pendente Aprovação")
    );
  }, [requisitions]);

  const approvedBudgetsForOSTreation = useMemo(() => {
    return budgets.filter(budget => budget.status === "Aprovado" && !budget.serviceOrderCreated);
  }, [budgets]);

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

        let newRequisitionStatus: PartsRequisitionStatusType = currentRequisition.status;
        const allItemsTriaged = updatedItems.every(item => item.status !== "Pendente Aprovação");

        if (allItemsTriaged) {
          newRequisitionStatus = "Triagem Realizada";
        } else {
          newRequisitionStatus = "Pendente";
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

  const isLoadingPageData = isLoadingRequisitions || isLoadingServiceOrders || isLoadingTechnicians || isLoadingCustomers || isLoadingEquipment || isLoadingBudgets;
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
    return <div className="text-red-500 p-4">Erro ao carregar requisições para triagem: {errorRequisitionsDataAll?.message || "Formato de dados inválido."}</div>;
  }
  if (isErrorBudgets || !Array.isArray(budgets)) {
    return <div className="text-red-500 p-4">Erro ao carregar orçamentos: {errorBudgetsData?.message || "Formato de dados inválido."}</div>;
  }


  return (
    <TooltipProvider>
      <PageHeader title="" />
      <p className="text-muted-foreground text-sm mb-6 -mt-4">
        Tela para o setor responsável (geralmente almoxarifado ou compras) analisar as requisições de peças feitas pelos técnicos. Permite aprovar ou recusar cada item solicitado e adicionar notas sobre a decisão. Também é o local para processar orçamentos aprovados para gerar as Ordens de Serviço correspondentes.
      </p>

      <section className="mb-10">
        <h2 className="text-2xl font-headline font-semibold mb-4 border-b pb-2">Orçamentos Aprovados para Geração de OS</h2>
        {approvedBudgetsForOSTreation.length === 0 && !isLoadingBudgets ? (
          <p className="text-muted-foreground">Nenhum orçamento aprovado aguardando geração de OS.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {approvedBudgetsForOSTreation.map((budget) => {
              const customer = customers?.find(c => c.id === budget.customerId);
              const equipment = equipmentList?.find(eq => eq.id === budget.equipmentId);
              return (
                <Card key={budget.id} className="flex flex-col shadow-lg">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle className="font-headline text-xl text-primary">Orçamento: {budget.budgetNumber}</CardTitle>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            Aprovado
                        </span>
                    </div>
                    <CardDescription>
                      Cliente: {toTitleCase(customer?.name) || 'N/A'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow space-y-2 text-sm">
                    {isLoadingEquipment || isLoadingCustomers ? <Loader2 className="animate-spin"/> : (
                        <>
                            {equipment && (
                                <>
                                <p className="flex items-center">
                                    <Layers className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                    <span className="font-medium text-muted-foreground mr-1">Máquina:</span>
                                    {toTitleCase(equipment.brand)} {toTitleCase(equipment.model)}
                                </p>
                                <p className="flex items-center">
                                    <Tag className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                    <span className="font-medium text-muted-foreground mr-1">Chassi:</span>
                                    {equipment.chassisNumber || "N/A"}
                                </p>
                                </>
                            )}
                            <p className="flex items-center">
                                <DollarSign className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                <span className="font-medium text-muted-foreground mr-1">Valor Total:</span>
                                {formatCurrency(budget.totalAmount)}
                            </p>
                            <p className="flex items-center">
                                <CalendarDays className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                                <span className="font-medium text-muted-foreground mr-1">Aprovado em:</span>
                                {budget.validUntilDate ? formatDateForDisplay(budget.validUntilDate) : formatDateForDisplay(budget.createdDate)}
                            </p>
                            {budget.notes && (
                                <p className="flex items-start">
                                    <FileText className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                                    <span className="font-medium text-muted-foreground mr-1">Obs. Orçam.:</span>
                                    <span className="whitespace-pre-wrap break-words">{budget.notes}</span>
                                </p>
                            )}
                        </>
                    )}
                  </CardContent>
                  <CardFooter className="border-t pt-4">
                     <Link
                        href={`/service-orders?action=create&fromBudgetId=${budget.id}`}
                        className={cn(buttonVariants({ variant: "default" }), "w-full bg-primary hover:bg-primary/90")}
                      >
                        <FileSignature className="mr-2 h-4 w-4"/> Gerar Ordem de Serviço
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-headline font-semibold mb-4 border-b pb-2">Requisições de Peças Pendentes de Triagem</h2>
        {requisitionsForTriage.length === 0 && !isLoadingRequisitions ? (
            <DataTablePlaceholder
            icon={ClipboardCheck}
            title="Nenhuma Requisição Pendente de Triagem"
            buttonLabel="Atualizar Lista"
            onButtonClick={() => queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] })}
            description="Aguardando novas requisições de peças dos técnicos ou todas já foram triadas."
            />
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {requisitionsForTriage.map((req) => {
                const serviceOrder = serviceOrders?.find(os => os.id === req.serviceOrderId);
                const technician = technicians?.find(t => t.id === req.technicianId);
                const customer = customers?.find(c => c.id === serviceOrder?.customerId);
                const equipment = equipmentList?.find(eq => eq.id === serviceOrder?.equipmentId);
                return (
                <Card key={req.id} className="flex flex-col shadow-lg">
                    <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle className="font-headline text-xl text-primary">Requisição: {req.requisitionNumber}</CardTitle>
                        <div className="flex items-center gap-2">
                            {req.status === "Atendida Parcialmente" && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button type="button" className="p-0 border-0 bg-transparent cursor-help">
                                        <MessageSquare className="h-5 w-5 text-orange-500" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Atendimento parcial pelo almoxarifado.</p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
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
                    {isLoadingEquipment ? (
                        <p className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando equipamento...</p>
                    ) : equipment ? (
                        <>
                        <p className="flex items-center">
                            <Layers className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium text-muted-foreground mr-1">Máquina:</span>
                            {toTitleCase(equipment.brand)} {toTitleCase(equipment.model)}
                        </p>
                        <p className="flex items-center">
                            <Tag className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium text-muted-foreground mr-1">Chassi:</span>
                            {equipment.chassisNumber || "N/A"}
                        </p>
                        {equipment.manufactureYear && (
                            <p className="flex items-center">
                            <CalendarDays className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium text-muted-foreground mr-1">Ano:</span>
                            {equipment.manufactureYear}
                            </p>
                        )}
                        </>
                    ) : serviceOrder?.equipmentId ? (
                        <p className="flex items-center text-xs text-destructive">
                        <AlertTriangle className="mr-2 h-3 w-3" /> Máquina (ID: {serviceOrder.equipmentId}) não encontrada.
                        </p>
                    ) : null}
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
      </section>

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
    </TooltipProvider>
  );
}

