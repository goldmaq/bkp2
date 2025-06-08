
"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { Archive, Loader2, User, ClipboardList, Wrench, CalendarDays, PackageSearch, AlertTriangle, Image as ImageIcon, CheckCircle, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, Timestamp, doc, updateDoc, runTransaction } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PartsRequisition, ServiceOrder, Technician, Customer, PartsRequisitionItem, PartsRequisitionItemStatusType, PartsRequisitionStatusType } from "@/types";
import { cn, formatDateForDisplay } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
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

interface CurrentItemAction {
  requisitionId: string;
  requisitionNumber: string;
  itemId: string;
  partName: string;
  currentStatus: PartsRequisitionItemStatusType;
  targetStatus: PartsRequisitionItemStatusType;
  currentWarehouseNotes?: string | null;
  currentEstimatedCost?: number | null;
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
  const queryClient = useQueryClient();

  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [currentItemAction, setCurrentItemAction] = useState<CurrentItemAction | null>(null);
  const [warehouseNotesInput, setWarehouseNotesInput] = useState("");
  const [estimatedCostInput, setEstimatedCostInput] = useState<string>("");


  const { data: requisitions = [], isLoading: isLoadingRequisitions, isError: isErrorRequisitions, error: errorRequisitions } = useQuery<PartsRequisition[], Error>({
    queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME],
    queryFn: fetchPartsRequisitions,
  });

  const { data: serviceOrders = [], isLoading: isLoadingServiceOrders, isError: isErrorServiceOrders, error: errorServiceOrders } = useQuery<ServiceOrder[], Error>({
    queryKey: [FIRESTORE_SERVICE_ORDER_COLLECTION_NAME],
    queryFn: fetchServiceOrders,
  });

  const { data: technicians = [], isLoading: isLoadingTechnicians, isError: isErrorTechnicians, error: errorTechnicians } = useQuery<Technician[], Error>({
    queryKey: [FIRESTORE_TECHNICIAN_COLLECTION_NAME],
    queryFn: fetchTechnicians,
  });

  const { data: customers = [], isLoading: isLoadingCustomers, isError: isErrorCustomers, error: errorCustomers } = useQuery<Customer[], Error>({
    queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME],
    queryFn: fetchCustomers,
  });

  const approvedItemsForSeparation = useMemo(() => {
    const items: ApprovedItem[] = [];
    requisitions.forEach(req => {
      req.items.forEach(item => {
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
     return items.sort((a, b) => {
        const dateA = new Date(a.requisitionCreatedDate).getTime();
        const dateB = new Date(b.requisitionCreatedDate).getTime();
        if (dateA !== dateB) {
            return dateA - dateB;
        }
        if (a.status === "Aprovado" && b.status !== "Aprovado") return -1;
        if (b.status === "Aprovado" && a.status !== "Aprovado") return 1;
        if (a.status === "Aguardando Compra" && b.status === "Separado") return -1;
        if (b.status === "Aguardando Compra" && a.status === "Separado") return 1;
        return 0;
    });
  }, [requisitions, serviceOrders, technicians, customers]);

  const updateWarehouseItemActionMutation = useMutation({
    mutationFn: async (data: {
        requisitionId: string;
        itemId: string;
        newStatus: PartsRequisitionItemStatusType;
        warehouseNotes?: string | null;
        estimatedCost?: number | null;
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
                warehouseNotes: data.warehouseNotes === undefined ? updatedItems[itemIndex].warehouseNotes : data.warehouseNotes,
                estimatedCost: data.estimatedCost === undefined ? updatedItems[itemIndex].estimatedCost : data.estimatedCost,
            };
            
            let newRequisitionStatus: PartsRequisitionStatusType = currentRequisition.status;

            if (currentRequisition.status !== "Cancelada") {
                const anyItemPendingApproval = updatedItems.some(i => i.status === "Pendente Aprovação");
                if (anyItemPendingApproval) {
                    newRequisitionStatus = "Pendente";
                } else {
                    const actionableItems = updatedItems.filter(i => i.status !== "Recusado");
                    if (actionableItems.length === 0) { // All items were recused by triage
                        newRequisitionStatus = "Triagem Realizada";
                    } else {
                        const allActionableItemsProcessedByWarehouse = actionableItems.every(
                            item => item.status === "Separado" || item.status === "Entregue"
                        );
                        const anyActionableItemProcessedByWarehouse = actionableItems.some(
                            item => item.status === "Separado" || item.status === "Entregue"
                        );
                        const anyActionableItemStillPendingForWarehouse = actionableItems.some(
                            item => item.status === "Aprovado" || item.status === "Aguardando Compra"
                        );

                        if (allActionableItemsProcessedByWarehouse) {
                            newRequisitionStatus = "Atendida Totalmente";
                        } else if (anyActionableItemProcessedByWarehouse && anyActionableItemStillPendingForWarehouse) {
                            newRequisitionStatus = "Atendida Parcialmente";
                        } else if (anyActionableItemProcessedByWarehouse && !anyActionableItemStillPendingForWarehouse) {
                            //This implies items were processed and the rest were recused earlier
                            newRequisitionStatus = "Atendida Totalmente";
                        }
                         else if (!anyActionableItemProcessedByWarehouse && anyActionableItemStillPendingForWarehouse) {
                            newRequisitionStatus = "Triagem Realizada"; // Waiting for warehouse to act on approved/to-buy items
                        } else if (!anyActionableItemProcessedByWarehouse && !anyActionableItemStillPendingForWarehouse) {
                             // All actionable items were recused (or none existed that were not recused)
                             newRequisitionStatus = "Triagem Realizada";
                        }
                    }
                }
            }
            transaction.update(reqRef, { items: updatedItems, status: newRequisitionStatus });
        });
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
        toast({ title: "Ação do Almoxarifado Concluída", description: "O item foi atualizado com sucesso." });
        setIsActionModalOpen(false);
        setCurrentItemAction(null);
        setWarehouseNotesInput("");
        setEstimatedCostInput("");
    },
    onError: (error: Error) => {
        toast({ title: "Erro na Ação do Almoxarifado", description: error.message, variant: "destructive" });
    }
  });


  const handleOpenActionModal = (
    item: ApprovedItem,
    targetStatus: PartsRequisitionItemStatusType
  ) => {
    setCurrentItemAction({
      requisitionId: item.requisitionId,
      requisitionNumber: item.requisitionNumber,
      itemId: item.id,
      partName: item.partName,
      currentStatus: item.status,
      targetStatus,
      currentWarehouseNotes: item.warehouseNotes,
      currentEstimatedCost: item.estimatedCost,
    });
    setWarehouseNotesInput(item.warehouseNotes || "");
    setEstimatedCostInput(item.estimatedCost?.toString() || "");
    setIsActionModalOpen(true);
  };

  const handleConfirmAction = () => {
    if (currentItemAction) {
        const cost = parseFloat(estimatedCostInput);
        updateWarehouseItemActionMutation.mutate({
            requisitionId: currentItemAction.requisitionId,
            itemId: currentItemAction.itemId,
            newStatus: currentItemAction.targetStatus,
            warehouseNotes: warehouseNotesInput.trim() || null,
            estimatedCost: !isNaN(cost) ? cost : null,
        });
    }
  };


  const isLoadingPageData = isLoadingRequisitions || isLoadingServiceOrders || isLoadingTechnicians || isLoadingCustomers;
  const isMutating = updateWarehouseItemActionMutation.isPending;

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

  if (isLoadingPageData && !isActionModalOpen) {
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
            <Card key={`${item.requisitionId}-${item.id}`} className={cn("flex flex-col shadow-lg", {
                "border-2 border-yellow-400": item.status === "Aguardando Compra",
                "border-2 border-green-500": item.status === "Separado",
                 "border-blue-400": item.status === "Aprovado",
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
                     {item.estimatedCost !== null && item.estimatedCost !== undefined && (
                        <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium">Custo:</span> R$ {item.estimatedCost.toFixed(2)}
                        </p>
                    )}
                    {item.warehouseNotes && (
                        <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-medium">Obs. Almox.:</span> {item.warehouseNotes}
                        </p>
                    )}
                </div>
              </CardContent>
              <CardFooter className="border-t pt-4">
                 <div className="flex gap-2 w-full">
                    {item.status === "Aprovado" && (
                        <>
                            <Button size="sm" variant="outline" className="flex-1 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={() => handleOpenActionModal(item, "Separado")} disabled={isMutating}>
                                <CheckCircle className="mr-1.5 h-4 w-4"/> Em Estoque (Separar)
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 border-yellow-500 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700" onClick={() => handleOpenActionModal(item, "Aguardando Compra")} disabled={isMutating}>
                                <ShoppingCart className="mr-1.5 h-4 w-4"/> Aguardar Compra
                            </Button>
                        </>
                    )}
                    {item.status === "Aguardando Compra" && (
                         <Button size="sm" variant="outline" className="flex-1 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={() => handleOpenActionModal(item, "Separado")} disabled={isMutating}>
                            <CheckCircle className="mr-1.5 h-4 w-4"/> Peça Chegou (Separar)
                        </Button>
                    )}
                    {/* O botão "Entregar ao Técnico" foi removido conforme solicitado */}
                 </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={isActionModalOpen} onOpenChange={setIsActionModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Ação Almoxarifado: {currentItemAction?.partName} (Req: {currentItemAction?.requisitionNumber})
            </AlertDialogTitle>
            <AlertDialogDescription>
              Confirmar ação para "{currentItemAction?.targetStatus}". Adicione custo e observações se necessário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div>
                <Label htmlFor="estimated-cost-input" className="text-sm font-medium">
                Custo Estimado/Real (R$)
                </Label>
                <Input
                id="estimated-cost-input"
                type="number"
                step="0.01"
                value={estimatedCostInput}
                onChange={(e) => setEstimatedCostInput(e.target.value)}
                placeholder="Ex: 125.90"
                className="mt-1"
                />
            </div>
            <div>
                <Label htmlFor="warehouse-notes-input" className="text-sm font-medium">
                Observações do Almoxarifado (Opcional)
                </Label>
                <Textarea
                id="warehouse-notes-input"
                value={warehouseNotesInput}
                onChange={(e) => setWarehouseNotesInput(e.target.value)}
                placeholder="Ex: Peça da marca X, fornecedor Y..."
                rows={3}
                className="mt-1"
                />
            </div>
            {updateWarehouseItemActionMutation.isError && (
                <p className="text-sm text-destructive mt-2">
                    Erro: {(updateWarehouseItemActionMutation.error as Error)?.message || "Não foi possível atualizar o item."}
                </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsActionModalOpen(false); setCurrentItemAction(null); setWarehouseNotesInput(""); setEstimatedCostInput("");}} disabled={isMutating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
                onClick={handleConfirmAction}
                disabled={isMutating}
                 className={cn(
                    (currentItemAction?.targetStatus === "Separado" || currentItemAction?.targetStatus === "Entregue") && buttonVariants({className: "bg-green-600 hover:bg-green-700"}),
                    currentItemAction?.targetStatus === "Aguardando Compra" && buttonVariants({className: "bg-yellow-500 hover:bg-yellow-600 text-black"}),
                )}
            >
              {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>}
              Confirmar {currentItemAction?.targetStatus}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

