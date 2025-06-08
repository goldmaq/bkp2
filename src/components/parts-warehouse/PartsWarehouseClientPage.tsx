
"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { Archive, Loader2, User, ClipboardList, CalendarDays, PackageSearch, AlertTriangle, Image as ImageIcon, CheckCircle, ShoppingCart, Search, Filter, Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, Timestamp, doc, updateDoc, runTransaction } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PartsRequisition, ServiceOrder, Technician, Customer, PartsRequisitionItem, PartsRequisitionItemStatusType, PartsRequisitionStatusType, Maquina } from "@/types";
import { cn, formatDateForDisplay, toTitleCase, parseNumericToNullOrNumber } from "@/lib/utils";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME = "partsRequisitions";
const FIRESTORE_SERVICE_ORDER_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";
const FIRESTORE_EQUIPMENT_COLLECTION_NAME = "equipamentos";

const ALL_STATUSES_FILTER_VALUE = "_ALL_STATUSES_WAREHOUSE_";

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
  equipmentDetails?: {
    brand: string;
    model: string;
    chassisNumber: string;
    manufactureYear: number | null;
  } | null;
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
  const q = query(collection(db!, FIRESTORE_CUSTOMER_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Customer));
}

async function fetchEquipmentList(): Promise<Maquina[]> {
  if (!db) throw new Error("Firebase Firestore connection not available.");
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

export function PartsWarehouseClientPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [currentItemAction, setCurrentItemAction] = useState<CurrentItemAction | null>(null);
  const [warehouseNotesInput, setWarehouseNotesInput] = useState("");
  const [estimatedCostInput, setEstimatedCostInput] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<PartsRequisitionItemStatusType | typeof ALL_STATUSES_FILTER_VALUE>(ALL_STATUSES_FILTER_VALUE);
  const [searchTerm, setSearchTerm] = useState("");


  const { data: requisitions = [], isLoading: isLoadingRequisitions, isError: isErrorRequisitions, error: errorRequisitionsDataAll } = useQuery<PartsRequisition[], Error>({
    queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME],
    queryFn: fetchPartsRequisitions,
    enabled: !!db,
  });

  const { data: serviceOrders = [], isLoading: isLoadingServiceOrders, isError: isErrorServiceOrders, error: errorServiceOrdersData } = useQuery<ServiceOrder[], Error>({
    queryKey: [FIRESTORE_SERVICE_ORDER_COLLECTION_NAME],
    queryFn: fetchServiceOrders,
    enabled: !!db,
  });

  const { data: technicians = [], isLoading: isLoadingTechnicians, isError: isErrorTechnicians, error: errorTechniciansData } = useQuery<Technician[], Error>({
    queryKey: [FIRESTORE_TECHNICIAN_COLLECTION_NAME],
    queryFn: fetchTechnicians,
    enabled: !!db,
  });

  const { data: customers = [], isLoading: isLoadingCustomers, isError: isErrorCustomers, error: errorCustomersData } = useQuery<Customer[], Error>({
    queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME],
    queryFn: fetchCustomers,
    enabled: !!db,
  });

  const { data: equipmentList = [], isLoading: isLoadingEquipment, isError: isErrorEquipment, error: errorEquipmentData } = useQuery<Maquina[], Error>({
    queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME],
    queryFn: fetchEquipmentList,
    enabled: !!db,
  });

  const approvedItemsForWarehouseProcessing = useMemo(() => {
    const items: ApprovedItem[] = [];
    requisitions.forEach(req => {
      req.items.forEach(item => {
        if (item.status === "Aprovado" || item.status === "Aguardando Compra" || item.status === "Separado") {
          const serviceOrder = serviceOrders?.find(os => os.id === req.serviceOrderId);
          const technician = technicians?.find(t => t.id === req.technicianId);
          const customer = customers?.find(c => c.id === serviceOrder?.customerId);
          const equipment = equipmentList?.find(eq => eq.id === serviceOrder?.equipmentId);
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
            equipmentDetails: equipment ? {
              brand: equipment.brand,
              model: equipment.model,
              chassisNumber: equipment.chassisNumber,
              manufactureYear: equipment.manufactureYear
            } : null,
          });
        }
      });
    });

    let filteredItems = items;

    if (statusFilter !== ALL_STATUSES_FILTER_VALUE) {
      filteredItems = filteredItems.filter(item => item.status === statusFilter);
    }

    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredItems = filteredItems.filter(item =>
        item.partName.toLowerCase().includes(lowerSearchTerm) ||
        item.requisitionNumber.toLowerCase().includes(lowerSearchTerm) ||
        (item.serviceOrderNumber && item.serviceOrderNumber.toLowerCase().includes(lowerSearchTerm)) ||
        (item.technicianName && item.technicianName.toLowerCase().includes(lowerSearchTerm)) ||
        (item.customerName && item.customerName.toLowerCase().includes(lowerSearchTerm)) ||
        (item.equipmentDetails?.brand.toLowerCase().includes(lowerSearchTerm)) ||
        (item.equipmentDetails?.model.toLowerCase().includes(lowerSearchTerm)) ||
        (item.equipmentDetails?.chassisNumber.toLowerCase().includes(lowerSearchTerm))
      );
    }

     return filteredItems.sort((a, b) => {
        const dateA = new Date(a.requisitionCreatedDate).getTime();
        const dateB = new Date(b.requisitionCreatedDate).getTime();
        if (dateA !== dateB) {
            return dateA - dateB;
        }
        const statusOrder: Record<PartsRequisitionItemStatusType, number> = {
            "Pendente Aprovação": 0,
            "Aprovado": 1,
            "Aguardando Compra": 2,
            "Separado": 3,
            "Recusado": 4,
            "Entregue": 5,
        };
        return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });
  }, [requisitions, serviceOrders, technicians, customers, equipmentList, statusFilter, searchTerm]);

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
                const actionableItems = updatedItems.filter(i => i.status !== "Recusado" && i.status !== "Pendente Aprovação");

                if (actionableItems.length === 0) {
                    if (updatedItems.every(i => i.status === "Recusado" || i.status === "Pendente Aprovação")){
                       newRequisitionStatus = updatedItems.some(i => i.status === "Pendente Aprovação") ? "Pendente" : "Triagem Realizada";
                    } else {
                       newRequisitionStatus = "Triagem Realizada";
                    }
                } else if (actionableItems.every(item => item.status === "Separado" || item.status === "Entregue")) {
                   newRequisitionStatus = "Atendida Totalmente";
                } else if (actionableItems.some(item => item.status === "Separado" || item.status === "Entregue")) {
                   newRequisitionStatus = "Atendida Parcialmente";
                } else if (actionableItems.every(item => item.status === "Aprovado" || item.status === "Aguardando Compra")) {
                    newRequisitionStatus = "Triagem Realizada";
                } else {
                   newRequisitionStatus = "Triagem Realizada";
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


  const isLoadingPageData = isLoadingRequisitions || isLoadingServiceOrders || isLoadingTechnicians || isLoadingCustomers || isLoadingEquipment;
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

  const combinedErrorMessages = [
    isErrorRequisitions && errorRequisitionsDataAll ? `Requisições: ${errorRequisitionsDataAll.message}` : null,
    isErrorServiceOrders && errorServiceOrdersData ? `Ordens de Serviço: ${errorServiceOrdersData.message}` : null,
    isErrorTechnicians && errorTechniciansData ? `Técnicos: ${errorTechniciansData.message}` : null,
    isErrorCustomers && errorCustomersData ? `Clientes: ${errorCustomersData.message}` : null,
    isErrorEquipment && errorEquipmentData ? `Equipamentos: ${errorEquipmentData.message}` : null,
  ].filter(Boolean);

  if (combinedErrorMessages.length > 0) {
    return <div className="text-red-500 p-4">Erro ao carregar dados do almoxarifado: {combinedErrorMessages.join("; ")}. Verifique o console.</div>;
  }


  return (
    <TooltipProvider>
      <PageHeader title="Almoxarifado - Peças para Separação e Compra" />

      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por peça, req., OS, técnico, cliente, máquina..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10"
          />
        </div>
        <div className="relative md:w-auto">
           <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
           <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as PartsRequisitionItemStatusType | typeof ALL_STATUSES_FILTER_VALUE)}
          >
            <SelectTrigger className="w-full md:w-[220px] pl-10">
              <SelectValue placeholder="Filtrar por status do item..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_FILTER_VALUE}>Todos os Status (Aprovados)</SelectItem>
              <SelectItem value="Aprovado">Aprovado (Aguardando Almox.)</SelectItem>
              <SelectItem value="Aguardando Compra">Aguardando Compra</SelectItem>
              <SelectItem value="Separado">Separado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {approvedItemsForWarehouseProcessing.length === 0 ? (
        <DataTablePlaceholder
          icon={Archive}
          title="Nenhuma Peça Encontrada"
          description={searchTerm.trim() || statusFilter !== ALL_STATUSES_FILTER_VALUE ? "Nenhuma peça corresponde aos filtros aplicados." : "Aguardando peças aprovadas na triagem ou todas já foram processadas."}
          buttonLabel="Atualizar Lista"
          onButtonClick={() => {
             queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
             toast({title: "Lista Atualizada", description: "Buscando novas peças..."})
            }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {approvedItemsForWarehouseProcessing.map((item) => (
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
                {item.equipmentDetails ? (
                    <p className="flex items-center">
                      <Construction className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Máquina:</span>
                       <Tooltip>
                        <TooltipTrigger asChild>
                           <span className="truncate">{`${toTitleCase(item.equipmentDetails.brand)} ${toTitleCase(item.equipmentDetails.model)}`}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{toTitleCase(item.equipmentDetails.brand)} {toTitleCase(item.equipmentDetails.model)}</p>
                          <p>Chassi: {item.equipmentDetails.chassisNumber || 'N/A'}</p>
                          <p>Ano: {item.equipmentDetails.manufactureYear || 'N/A'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </p>
                  ) : isLoadingEquipment ? (
                    <p className="flex items-center text-xs text-muted-foreground">
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Carregando dados da máquina...
                    </p>
                  ) : item.serviceOrderId ? ( 
                    <p className="flex items-center text-xs text-destructive">
                      <AlertTriangle className="mr-2 h-3 w-3" /> Máquina não encontrada para esta OS.
                    </p>
                  ) : null}
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
                            <span className="font-medium">Custo:</span> R$ {Number(item.estimatedCost).toFixed(2)}
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
                 <div className="flex flex-col gap-2 w-full">
                    {item.status === "Aprovado" && (
                        <>
                            <Button size="sm" variant="outline" className="w-full border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={() => handleOpenActionModal(item, "Separado")} disabled={isMutating}>
                                <CheckCircle className="mr-1.5 h-4 w-4"/> Em Estoque (Separar)
                            </Button>
                            <Button size="sm" variant="outline" className="w-full border-yellow-500 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700" onClick={() => handleOpenActionModal(item, "Aguardando Compra")} disabled={isMutating}>
                                <ShoppingCart className="mr-1.5 h-4 w-4"/> Aguardar Compra
                            </Button>
                        </>
                    )}
                    {item.status === "Aguardando Compra" && (
                         <Button size="sm" variant="outline" className="w-full border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={() => handleOpenActionModal(item, "Separado")} disabled={isMutating}>
                            <CheckCircle className="mr-1.5 h-4 w-4"/> Peça Chegou (Separar)
                        </Button>
                    )}
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
    </TooltipProvider>
  );
}

    