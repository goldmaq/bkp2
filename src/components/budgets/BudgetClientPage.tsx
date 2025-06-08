
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, FileText, Users, Construction, Mail, MessageSquare, DollarSign, Trash2, Loader2, AlertTriangle, CalendarDays, ShoppingCart, Percent, Edit, Save, ThumbsUp, Ban, Pencil } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import type { Budget, BudgetItem, ServiceOrder, Customer, Maquina, BudgetStatusType } from "@/types";
import { BudgetSchema, BudgetItemSchema, budgetStatusOptions } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, serverTimestamp } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isValid as isValidDate } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from "@/lib/utils";
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

const FIRESTORE_BUDGET_COLLECTION_NAME = "budgets";
const FIRESTORE_SERVICE_ORDER_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";
const FIRESTORE_EQUIPMENT_COLLECTION_NAME = "equipamentos";

const NO_SERVICE_ORDER_SELECTED = "_NO_SERVICE_ORDER_SELECTED_";

const toTitleCase = (str: string | undefined | null): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatDateForDisplay = (isoDate?: string | null): string => {
  if (!isoDate) return "N/A";
  try {
    const parsedDate = isoDate instanceof Timestamp ? isoDate.toDate() : parseISO(isoDate);
    if (!isValidDate(parsedDate)) return "Data Inválida";
    return format(parsedDate, "dd/MM/yyyy", { locale: ptBR });
  } catch (e) {
    return "Erro na Data";
  }
};


const formatCurrency = (value?: number | null): string => {
  if (value === null || value === undefined) return "R$ 0,00";
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

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
    } as Budget;
  });
}

async function fetchServiceOrders(): Promise<ServiceOrder[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_SERVICE_ORDER_COLLECTION_NAME), orderBy("orderNumber", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ServiceOrder));
}

async function fetchCustomers(): Promise<Customer[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_CUSTOMER_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Customer));
}

async function fetchEquipment(): Promise<Maquina[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_EQUIPMENT_COLLECTION_NAME), orderBy("brand", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Maquina));
}

const getNextBudgetNumber = (currentBudgets: Budget[]): string => {
  if (!currentBudgets || currentBudgets.length === 0) return "ORC-0001";
  let maxNum = 0;
  currentBudgets.forEach(budget => {
    const numPartMatch = budget.budgetNumber.match(/ORC-(\d+)/);
    if (numPartMatch && numPartMatch[1]) {
      const num = parseInt(numPartMatch[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });
  return `ORC-${(maxNum + 1).toString().padStart(4, '0')}`;
};

const getWhatsAppNumber = (phone?: string): string => {
  if (!phone) return "";
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) return cleaned;
  if (!cleaned.startsWith('55') && (cleaned.length === 10 || cleaned.length === 11)) return `55${cleaned}`;
  return cleaned;
};

export function BudgetClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isStatusConfirmModalOpen, setIsStatusConfirmModalOpen] = useState(false);
  const [statusChangeInfo, setStatusChangeInfo] = useState<{ budgetId: string; budgetNumber: string, newStatus: BudgetStatusType } | null>(null);


  const form = useForm<z.infer<typeof BudgetSchema>>({
    resolver: zodResolver(BudgetSchema),
    defaultValues: {
      budgetNumber: "",
      serviceOrderId: NO_SERVICE_ORDER_SELECTED,
      customerId: "",
      equipmentId: "",
      status: "Pendente",
      items: [{ id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }],
      shippingCost: 0,
      subtotal: 0,
      totalAmount: 0,
      createdDate: new Date().toISOString().split('T')[0],
      validUntilDate: null,
      notes: "",
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const itemsWatch = useWatch({ control: form.control, name: "items" });
  const shippingCostWatch = useWatch({ control: form.control, name: "shippingCost" });

  useEffect(() => {
    let subtotal = 0;
    itemsWatch?.forEach(item => {
      subtotal += (item.quantity || 0) * (item.unitPrice || 0);
    });
    form.setValue("subtotal", subtotal);
    form.setValue("totalAmount", subtotal + (shippingCostWatch || 0));
  }, [itemsWatch, shippingCostWatch, form]);


  const { data: budgets = [], isLoading: isLoadingBudgets, isError: isErrorBudgets, error: errorBudgets } = useQuery<Budget[], Error>({
    queryKey: [FIRESTORE_BUDGET_COLLECTION_NAME],
    queryFn: fetchBudgets,
    enabled: !!db,
  });

  const { data: serviceOrders = [], isLoading: isLoadingServiceOrders } = useQuery<ServiceOrder[], Error>({
    queryKey: [FIRESTORE_SERVICE_ORDER_COLLECTION_NAME],
    queryFn: fetchServiceOrders,
    enabled: !!db,
  });

  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[], Error>({
    queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME],
    queryFn: fetchCustomers,
    enabled: !!db,
  });

  const { data: equipmentList = [], isLoading: isLoadingEquipment } = useQuery<Maquina[], Error>({
    queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME],
    queryFn: fetchEquipment,
    enabled: !!db,
  });

  const selectedServiceOrderId = useWatch({ control: form.control, name: 'serviceOrderId' });

  useEffect(() => {
    if (selectedServiceOrderId && selectedServiceOrderId !== NO_SERVICE_ORDER_SELECTED) {
      const selectedOS = serviceOrders.find(os => os.id === selectedServiceOrderId);
      if (selectedOS) {
        form.setValue('customerId', selectedOS.customerId, { shouldValidate: true });
        form.setValue('equipmentId', selectedOS.equipmentId, { shouldValidate: true });
      }
    } else if (!editingBudget) { // Only clear if not editing (to preserve data when opening existing budget without OS)
      form.setValue('customerId', "", { shouldValidate: true });
      form.setValue('equipmentId', "", { shouldValidate: true });
    }
  }, [selectedServiceOrderId, serviceOrders, form, editingBudget]);


  const addBudgetMutation = useMutation({
    mutationFn: async (newBudgetData: z.infer<typeof BudgetSchema>) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      const dataToSave = {
        ...newBudgetData,
        createdDate: Timestamp.fromDate(new Date()), // Always set to current date on creation
        validUntilDate: newBudgetData.validUntilDate ? Timestamp.fromDate(parseISO(newBudgetData.validUntilDate)) : null,
        items: newBudgetData.items.map(item => ({...item, totalPrice: (item.quantity * item.unitPrice)})),
        subtotal: newBudgetData.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0),
        totalAmount: newBudgetData.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0) + (newBudgetData.shippingCost || 0),
      };
      return addDoc(collection(db, FIRESTORE_BUDGET_COLLECTION_NAME), dataToSave);
    },
    onSuccess: (docRef, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_BUDGET_COLLECTION_NAME] });
      toast({ title: "Orçamento Criado", description: `Orçamento ${variables.budgetNumber} foi criado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Criar", description: `Não foi possível criar o orçamento ${variables.budgetNumber}. Detalhes: ${err.message}`, variant: "destructive" });
    },
  });

  const updateBudgetMutation = useMutation({
    mutationFn: async (budgetData: Budget) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      const { id, ...dataToUpdate } = budgetData;
      if (!id) throw new Error("ID do orçamento é necessário.");
      const budgetRef = doc(db, FIRESTORE_BUDGET_COLLECTION_NAME, id);
      
      // Fetch original createdDate to preserve it
      const originalBudgetDoc = await getDoc(budgetRef);
      const originalCreatedDate = originalBudgetDoc.exists() ? originalBudgetDoc.data().createdDate : Timestamp.fromDate(parseISO(dataToUpdate.createdDate));

      const dataToSave = {
        ...dataToUpdate,
        createdDate: originalCreatedDate, // Preserve original creation date
        validUntilDate: dataToUpdate.validUntilDate ? Timestamp.fromDate(parseISO(dataToUpdate.validUntilDate)) : null,
        items: dataToUpdate.items.map(item => ({...item, totalPrice: (item.quantity * item.unitPrice)})),
        subtotal: dataToUpdate.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0),
        totalAmount: dataToUpdate.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0) + (dataToUpdate.shippingCost || 0),
      };
      return updateDoc(budgetRef, dataToSave);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_BUDGET_COLLECTION_NAME] });
      toast({ title: "Orçamento Atualizado", description: `Orçamento ${variables.budgetNumber} foi atualizado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar", description: `Não foi possível atualizar o orçamento ${variables.budgetNumber}. Detalhes: ${err.message}`, variant: "destructive" });
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async (budgetId: string) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      return deleteDoc(doc(db, FIRESTORE_BUDGET_COLLECTION_NAME, budgetId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_BUDGET_COLLECTION_NAME] });
      toast({ title: "Orçamento Excluído" });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Excluir", description: `Detalhes: ${err.message}`, variant: "destructive" });
    },
  });

  const updateBudgetStatusMutation = useMutation({
    mutationFn: async ({ budgetId, newStatus }: { budgetId: string; newStatus: BudgetStatusType }) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      const budgetRef = doc(db, FIRESTORE_BUDGET_COLLECTION_NAME, budgetId);
      return updateDoc(budgetRef, { status: newStatus });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_BUDGET_COLLECTION_NAME] });
      toast({ title: "Status Atualizado", description: `O orçamento foi atualizado para "${variables.newStatus}".` });
      setIsStatusConfirmModalOpen(false);
      setStatusChangeInfo(null);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Atualizar Status", description: `Detalhes: ${err.message}`, variant: "destructive" });
      setIsStatusConfirmModalOpen(false);
      setStatusChangeInfo(null);
    },
  });


  const openModal = useCallback((budget?: Budget) => {
    if (budget) {
      setEditingBudget(budget);
      setIsEditMode(false);
      form.reset({
        ...budget,
        createdDate: budget.createdDate ? format(parseISO(budget.createdDate), 'yyyy-MM-dd') : new Date().toISOString().split('T')[0],
        validUntilDate: budget.validUntilDate ? format(parseISO(budget.validUntilDate), 'yyyy-MM-dd') : null,
        items: budget.items.map(item => ({...item, id: item.id || crypto.randomUUID()})),
        serviceOrderId: budget.serviceOrderId || NO_SERVICE_ORDER_SELECTED,
      });
    } else {
      setEditingBudget(null);
      setIsEditMode(true);
      form.reset({
        budgetNumber: getNextBudgetNumber(budgets),
        serviceOrderId: NO_SERVICE_ORDER_SELECTED,
        customerId: "",
        equipmentId: "",
        status: "Pendente",
        items: [{ id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }],
        shippingCost: 0,
        subtotal: 0,
        totalAmount: 0,
        createdDate: new Date().toISOString().split('T')[0], // Set to today, will be read-only
        validUntilDate: null,
        notes: "",
      });
    }
    setIsModalOpen(true);
  }, [form, budgets]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBudget(null);
    setIsEditMode(false);
    form.reset();
  };

  const onSubmit = (values: z.infer<typeof BudgetSchema>) => {
    const budgetData = {
      ...values,
      // createdDate is handled by mutations
      items: values.items.map(item => ({...item, totalPrice: (item.quantity * item.unitPrice)})),
      subtotal: values.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0),
      totalAmount: values.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0) + (values.shippingCost || 0),
    };

    if (editingBudget && editingBudget.id) {
      updateBudgetMutation.mutate({ ...budgetData, id: editingBudget.id, createdDate: editingBudget.createdDate } as Budget);
    } else {
      // For new budgets, createdDate from form (today) is passed, addBudgetMutation will use Timestamp.now()
      addBudgetMutation.mutate(budgetData);
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingBudget && editingBudget.id) {
      if (window.confirm(`Tem certeza que deseja excluir o orçamento "${editingBudget.budgetNumber}"?`)) {
        deleteBudgetMutation.mutate(editingBudget.id);
      }
    }
  };

  const handleAddItem = () => {
    append({ id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, totalPrice: 0 });
  };

  const handleItemChange = (index: number, field: keyof BudgetItem, value: string | number) => {
    const currentItem = itemsWatch[index];
    const newQuantity = field === 'quantity' ? Number(value) : currentItem.quantity;
    const newUnitPrice = field === 'unitPrice' ? Number(value) : currentItem.unitPrice;
    const newDescription = field === 'description' ? String(value) : currentItem.description;

    update(index, {
        ...currentItem,
        description: newDescription,
        quantity: newQuantity,
        unitPrice: newUnitPrice,
        totalPrice: newQuantity * newUnitPrice,
    });
  };

  const handleChangeStatus = (budgetId: string, budgetNumber: string, newStatus: BudgetStatusType) => {
    setStatusChangeInfo({ budgetId, budgetNumber, newStatus });
    setIsStatusConfirmModalOpen(true);
  };

  const confirmChangeStatus = () => {
    if (statusChangeInfo) {
      updateBudgetStatusMutation.mutate(statusChangeInfo);
    }
  };

  const isLoadingPageData = isLoadingBudgets || isLoadingServiceOrders || isLoadingCustomers || isLoadingEquipment;
  const isMutating = addBudgetMutation.isPending || updateBudgetMutation.isPending || deleteBudgetMutation.isPending || updateBudgetStatusMutation.isPending;

  if (!db) {
    return <div className="text-red-500 p-4">Erro: Conexão com Firebase não disponível.</div>;
  }
  if (isLoadingPageData && !isModalOpen) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Carregando dados...</p></div>;
  }
  if (isErrorBudgets) {
    return <div className="text-red-500 p-4">Erro ao carregar orçamentos: {errorBudgets?.message}</div>;
  }

  const getCustomerInfo = (customerId: string) => customers.find(c => c.id === customerId);
  const getEquipmentInfo = (equipmentId: string) => equipmentList.find(e => e.id === equipmentId);
  const getServiceOrderInfo = (serviceOrderId: string) => serviceOrders.find(os => os.id === serviceOrderId);

  return (
    <>
      <PageHeader
        title="Orçamentos"
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating}>
            <PlusCircle className="mr-2 h-4 w-4" /> Criar Orçamento
          </Button>
        }
      />

      {budgets.length === 0 && !isLoadingBudgets ? (
        <DataTablePlaceholder
          icon={FileText}
          title="Nenhum Orçamento Criado"
          description="Crie seu primeiro orçamento para começar."
          buttonLabel="Criar Orçamento"
          onButtonClick={() => openModal()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {budgets.map((budget) => {
            const customer = getCustomerInfo(budget.customerId);
            const equipment = getEquipmentInfo(budget.equipmentId);
            const serviceOrder = getServiceOrderInfo(budget.serviceOrderId);
            const whatsappNumber = customer?.phone ? getWhatsAppNumber(customer.phone) : null;

            const mailtoHref = customer?.email
              ? `mailto:${customer.email}?subject=${encodeURIComponent(`Orçamento Gold Maq: ${budget.budgetNumber}`)}&body=${encodeURIComponent(`Prezado(a) ${toTitleCase(customer.name)},\n\nSegue o orçamento ${budget.budgetNumber} referente à Ordem de Serviço ${serviceOrder?.orderNumber || 'N/A'}.\n\nValor Total: ${formatCurrency(budget.totalAmount)}\n\nAtenciosamente,\nEquipe Gold Maq`)}`
              : "#";

            const whatsappHref = whatsappNumber
              ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Olá ${toTitleCase(customer?.name)}, segue o orçamento ${budget.budgetNumber} (OS: ${serviceOrder?.orderNumber || 'N/A'}) com valor total de ${formatCurrency(budget.totalAmount)}. Atenciosamente, Equipe Gold Maq.`)}`
              : "#";

            const canApprove = budget.status === "Pendente" || budget.status === "Enviado";
            const canDeny = budget.status === "Pendente" || budget.status === "Enviado" || budget.status === "Aprovado";
            const canCancel = budget.status !== "Cancelado" && budget.status !== "Recusado"; // Example: can cancel if not already cancelled/denied
            const canReopen = budget.status === "Aprovado" || budget.status === "Recusado" || budget.status === "Cancelado";


            return (
              <Card key={budget.id} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300">
                <div onClick={() => openModal(budget)} className="cursor-pointer flex-grow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                        <CardTitle className="font-headline text-xl text-primary">Orçamento: {budget.budgetNumber}</CardTitle>
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", {
                            "bg-yellow-100 text-yellow-700": budget.status === "Pendente" || budget.status === "Enviado",
                            "bg-green-100 text-green-700": budget.status === "Aprovado",
                            "bg-red-100 text-red-700": budget.status === "Recusado" || budget.status === "Cancelado",
                        })}>
                            {budget.status}
                        </span>
                    </div>
                    <CardDescription>OS Vinculada: {serviceOrder?.orderNumber || budget.serviceOrderId}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow space-y-2 text-sm">
                    <p className="flex items-center">
                      <Users className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Cliente:</span>
                      {isLoadingCustomers ? 'Carregando...' : toTitleCase(customer?.name) || 'N/A'}
                    </p>
                    <p className="flex items-center">
                      <Construction className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Equip.:</span>
                      {isLoadingEquipment ? 'Carregando...' : `${toTitleCase(equipment?.brand)} ${toTitleCase(equipment?.model)} (Chassi: ${equipment?.chassisNumber || 'N/A'})`}
                    </p>
                    <p className="flex items-center">
                      <DollarSign className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Valor Total:</span>
                      {formatCurrency(budget.totalAmount)}
                    </p>
                    <p className="flex items-center">
                      <CalendarDays className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Criado em:</span>
                      {formatDateForDisplay(budget.createdDate)}
                    </p>
                    {budget.validUntilDate && (
                      <p className="flex items-center">
                        <CalendarDays className="mr-2 h-4 w-4 text-accent flex-shrink-0" />
                        <span className="font-medium text-muted-foreground mr-1">Válido até:</span>
                        {formatDateForDisplay(budget.validUntilDate)}
                      </p>
                    )}
                  </CardContent>
                </div>
                <CardFooter className="border-t pt-4 flex flex-col sm:flex-row justify-between items-center gap-2">
                  <div className="flex flex-wrap gap-2">
                      {canApprove && (
                          <Button variant="outline" size="xs" className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={(e) => { e.stopPropagation(); handleChangeStatus(budget.id, budget.budgetNumber, 'Aprovado'); }} disabled={isMutating}>
                              <ThumbsUp className="mr-1.5 h-3.5 w-3.5"/> Aprovar
                          </Button>
                      )}
                      {canDeny && (budget.status === "Pendente" || budget.status === "Enviado") && (
                          <Button variant="outline" size="xs" className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={(e) => { e.stopPropagation(); handleChangeStatus(budget.id, budget.budgetNumber, 'Recusado'); }} disabled={isMutating}>
                              <Ban className="mr-1.5 h-3.5 w-3.5"/> Recusar
                          </Button>
                      )}
                       {canCancel && (budget.status !== "Cancelado") && (
                          <Button variant="outline" size="xs" className="border-slate-500 text-slate-600 hover:bg-slate-50 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); handleChangeStatus(budget.id, budget.budgetNumber, 'Cancelado'); }} disabled={isMutating}>
                             <X className="mr-1.5 h-3.5 w-3.5"/> Cancelar
                          </Button>
                      )}
                      {canReopen && (
                        <Button variant="outline" size="xs" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" onClick={(e) => { e.stopPropagation(); handleChangeStatus(budget.id, budget.budgetNumber, 'Pendente'); }} disabled={isMutating}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5"/> Reabrir
                        </Button>
                      )}
                  </div>
                  <div className="flex gap-2 mt-2 sm:mt-0">
                      <Button
                          variant="outline"
                          size="xs"
                          asChild
                          disabled={!customer?.email}
                          onClick={(e) => e.stopPropagation()}
                      >
                          <a href={mailtoHref} target="_blank" rel="noopener noreferrer" className="flex items-center">
                          <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
                          </a>
                      </Button>
                      <Button
                          variant="outline"
                          size="xs"
                          asChild
                          disabled={!whatsappNumber}
                          onClick={(e) => e.stopPropagation()}
                      >
                          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex items-center">
                          <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                          </a>
                      </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingBudget ? "Editar Orçamento" : "Criar Novo Orçamento"}
        description="Preencha os detalhes do orçamento."
        formId="budget-form"
        isSubmitting={isMutating}
        editingItem={editingBudget}
        onDeleteConfirm={handleModalDeleteConfirm}
        isDeleting={deleteBudgetMutation.isPending}
        deleteButtonLabel="Excluir Orçamento"
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
        submitButtonLabel={editingBudget && !isEditMode ? "Editar" : (editingBudget ? "Salvar Alterações" : "Criar Orçamento")}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="budget-form" className="space-y-6">
            <fieldset disabled={!!editingBudget && !isEditMode} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="budgetNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número do Orçamento</FormLabel>
                    <FormControl><Input {...field} readOnly className="bg-muted/50" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="serviceOrderId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordem de Serviço Vinculada</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger>
                        <SelectValue placeholder={isLoadingServiceOrders ? "Carregando OS..." : "Selecione uma OS"} />
                      </SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NO_SERVICE_ORDER_SELECTED}>Nenhuma</SelectItem>
                        {serviceOrders.map(os => (
                          <SelectItem key={os.id} value={os.id}>
                            OS: {os.orderNumber} (Cliente: {toTitleCase(customers.find(c => c.id === os.customerId)?.name)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {selectedServiceOrderId && selectedServiceOrderId !== NO_SERVICE_ORDER_SELECTED && (
                <Card className="bg-muted/30">
                    <CardHeader className="pb-2 pt-3">
                        <CardTitle className="text-sm font-medium">Detalhes da OS Vinculada</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-1 pb-3">
                        <p><strong>Cliente:</strong> {toTitleCase(getCustomerInfo(form.getValues("customerId"))?.name) || 'N/A'}</p>
                        <p><strong>Equipamento:</strong> {`${toTitleCase(getEquipmentInfo(form.getValues("equipmentId"))?.brand)} ${toTitleCase(getEquipmentInfo(form.getValues("equipmentId"))?.model)} (Chassi: ${getEquipmentInfo(form.getValues("equipmentId"))?.chassisNumber || 'N/A'})`}</p>
                    </CardContent>
                </Card>
              )}

              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status do Orçamento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger></FormControl>
                    <SelectContent>{budgetStatusOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />

              <div>
                <h3 className="text-md font-semibold mb-2 mt-4 border-b pb-1 font-headline">Itens do Orçamento</h3>
                {fields.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-end border-b py-3">
                    <FormField name={`items.${index}.description`} render={() => (
                      <FormItem className="col-span-12 sm:col-span-5">
                        {index === 0 && <FormLabel>Descrição</FormLabel>}
                        <FormControl>
                          <Input placeholder="Peça ou Serviço" value={itemsWatch[index]?.description || ""} onChange={e => handleItemChange(index, 'description', e.target.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField name={`items.${index}.quantity`} render={() => (
                      <FormItem className="col-span-4 sm:col-span-2">
                         {index === 0 && <FormLabel>Qtd.</FormLabel>}
                        <FormControl>
                           <Input type="number" placeholder="1" value={itemsWatch[index]?.quantity || ""} onChange={e => handleItemChange(index, 'quantity', parseFloat(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                     <FormField name={`items.${index}.unitPrice`} render={() => (
                      <FormItem className="col-span-4 sm:col-span-2">
                        {index === 0 && <FormLabel>Preço Un.</FormLabel>}
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" value={itemsWatch[index]?.unitPrice || ""} onChange={e => handleItemChange(index, 'unitPrice', parseFloat(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="col-span-4 sm:col-span-2 flex items-center">
                        {index === 0 && <FormLabel className="invisible sm:visible">Total</FormLabel>}
                        <p className="text-sm pt-1 sm:pt-0 w-full text-right sm:text-left font-medium">{formatCurrency((itemsWatch[index]?.quantity || 0) * (itemsWatch[index]?.unitPrice || 0))}</p>
                    </div>
                    <div className="col-span-12 sm:col-span-1 flex justify-end sm:justify-center">
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="mt-3">
                  <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Item
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <FormField control={form.control} name="shippingCost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custo de Frete (Opcional)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="text-right space-y-1 mt-4">
                <p className="text-sm">Subtotal: <span className="font-semibold">{formatCurrency(form.getValues("subtotal"))}</span></p>
                <p className="text-lg font-bold text-primary">Valor Total: <span className="font-bold">{formatCurrency(form.getValues("totalAmount"))}</span></p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="createdDate" render={({ field }) => (
                  <FormItem><FormLabel>Data de Criação</FormLabel><FormControl><Input type="date" {...field} readOnly className="bg-muted/50" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="validUntilDate" render={({ field }) => (
                  <FormItem><FormLabel>Válido Até (Opcional)</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações (Opcional)</FormLabel><FormControl><Textarea placeholder="Condições de pagamento, informações adicionais..." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>
          </form>
        </Form>
      </FormModal>

       <AlertDialog open={isStatusConfirmModalOpen} onOpenChange={setIsStatusConfirmModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Mudança de Status</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar o status do orçamento "{statusChangeInfo?.budgetNumber}" para "{statusChangeInfo?.newStatus}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsStatusConfirmModalOpen(false); setStatusChangeInfo(null);}} disabled={isMutating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmChangeStatus} disabled={isMutating} className={cn(
                statusChangeInfo?.newStatus === "Aprovado" && buttonVariants({className: "bg-green-600 hover:bg-green-700"}),
                statusChangeInfo?.newStatus === "Recusado" && buttonVariants({variant: "destructive"}),
                statusChangeInfo?.newStatus === "Cancelado" && buttonVariants({variant: "destructive"}),
            )}>
              {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
