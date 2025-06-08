
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, Wrench, ClipboardList, User, Construction, CalendarDays, ImagePlus, Trash2, Loader2, FileText, XCircle, PackageSearch, AlertTriangle, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, Timestamp, setDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PartsRequisition, PartsRequisitionItem, ServiceOrder, Technician, Customer } from "@/types";
import { PartsRequisitionSchema } from "@/types";
import { cn, formatDateForDisplay, getFileNameFromUrl } from "@/lib/utils";

const FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME = "partsRequisitions";
const FIRESTORE_SERVICE_ORDER_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";

const NO_SERVICE_ORDER_SELECTED = "_NO_OS_SELECTED_";
const NO_TECHNICIAN_SELECTED = "_NO_TECHNICIAN_SELECTED_";

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

async function fetchOpenServiceOrders(): Promise<ServiceOrder[]> {
  if (!db) throw new Error("Firebase DB is not available");
  const q = query(collection(db, FIRESTORE_SERVICE_ORDER_COLLECTION_NAME), orderBy("orderNumber", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ServiceOrder))
    .filter(os => os.phase !== "Concluída" && os.phase !== "Cancelada");
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

const getNextRequisitionNumber = (currentRequisitions: PartsRequisition[]): string => {
  if (!currentRequisitions || currentRequisitions.length === 0) return "REQ-0001";
  let maxNum = 0;
  currentRequisitions.forEach(req => {
    const numPartMatch = req.requisitionNumber.match(/REQ-(\d+)/);
    if (numPartMatch && numPartMatch[1]) {
      const num = parseInt(numPartMatch[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });
  return `REQ-${(maxNum + 1).toString().padStart(4, '0')}`;
};

async function uploadPartImageToStorage(file: File, requisitionId: string, itemId: string): Promise<string> {
  if (!storage) throw new Error("Firebase Storage is not available.");
  const filePath = `parts_requisitions/${requisitionId}/${itemId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fileRef = storageRef(storage, filePath);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}

async function deletePartImageFromStorage(imageUrl?: string | null) {
  if (!imageUrl) return;
  if (!storage) {
    console.warn("Storage not available, skipping deletion of image:", imageUrl);
    return;
  }
  try {
    // Correctly extract the path from the Firebase Storage URL
    const imageRef = storageRef(storage, imageUrl);
    await deleteObject(imageRef);
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      console.warn("Image not found in storage, skipping deletion:", imageUrl);
    } else {
      console.error("Error deleting image from storage:", error);
      // Potentially re-throw or handle more gracefully if needed
    }
  }
}


export function PartsRequisitionClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRequisition, setEditingRequisition] = useState<PartsRequisition | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [partImageFiles, setPartImageFiles] = useState<Record<string, File | null>>({});
  const [imagePreviews, setImagePreviews] = useState<Record<string, string | null>>({});

  const form = useForm<z.infer<typeof PartsRequisitionSchema>>({
    resolver: zodResolver(PartsRequisitionSchema),
    defaultValues: {
      requisitionNumber: "",
      serviceOrderId: NO_SERVICE_ORDER_SELECTED,
      technicianId: NO_TECHNICIAN_SELECTED,
      status: "Pendente",
      items: [],
      generalNotes: "",
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: requisitions = [], isLoading: isLoadingRequisitions, isError: isErrorRequisitions, error: errorRequisitions } = useQuery<PartsRequisition[], Error>({
    queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME],
    queryFn: fetchPartsRequisitions,
  });

  const { data: serviceOrders = [], isLoading: isLoadingServiceOrders } = useQuery<ServiceOrder[], Error>({
    queryKey: [FIRESTORE_SERVICE_ORDER_COLLECTION_NAME, "open"],
    queryFn: fetchOpenServiceOrders,
  });

  const { data: technicians = [], isLoading: isLoadingTechnicians } = useQuery<Technician[], Error>({
    queryKey: [FIRESTORE_TECHNICIAN_COLLECTION_NAME],
    queryFn: fetchTechnicians,
  });

  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[], Error>({
    queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME],
    queryFn: fetchCustomers,
  });

  const openModal = useCallback((requisition?: PartsRequisition) => {
    setPartImageFiles({});
    setImagePreviews({});
    if (requisition) {
      setEditingRequisition(requisition);
      setIsEditMode(false);
      form.reset({
        ...requisition,
        id: requisition.id, // Ensure ID is part of form if needed for Zod, or handle separately
        requisitionNumber: requisition.requisitionNumber,
        serviceOrderId: requisition.serviceOrderId || NO_SERVICE_ORDER_SELECTED,
        technicianId: requisition.technicianId || NO_TECHNICIAN_SELECTED,
        status: requisition.status,
        items: requisition.items.map(item => ({...item, id: item.id || crypto.randomUUID()})),
        generalNotes: requisition.generalNotes || "",
      });
      const previews: Record<string, string> = {};
      requisition.items.forEach(item => {
        if (item.imageUrl && item.id) previews[item.id] = item.imageUrl;
      });
      setImagePreviews(previews);
    } else {
      setEditingRequisition(null);
      setIsEditMode(true);
      form.reset({
        id: undefined, // Explicitly undefined for new
        requisitionNumber: getNextRequisitionNumber(requisitions),
        serviceOrderId: NO_SERVICE_ORDER_SELECTED,
        technicianId: NO_TECHNICIAN_SELECTED,
        status: "Pendente",
        items: [{ id: crypto.randomUUID(), partName: "", quantity: 1, notes: "", imageUrl: null, status: "Pendente Aprovação" }],
        generalNotes: "",
      });
    }
    setIsModalOpen(true);
  }, [form, requisitions]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRequisition(null);
    setIsEditMode(false);
    form.reset();
    setPartImageFiles({});
    setImagePreviews({});
  };

  const handleItemImageChange = (itemId: string, file: File | null) => {
    setPartImageFiles(prev => ({ ...prev, [itemId]: file }));
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => ({ ...prev, [itemId]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    } else {
      // If file is null (cleared), try to revert to existing imageUrl if in edit mode.
      const currentItemInForm = form.getValues('items').find(i => i.id === itemId);
      if (currentItemInForm?.imageUrl) {
         setImagePreviews(prev => ({ ...prev, [itemId]: currentItemInForm.imageUrl }));
      } else {
        setImagePreviews(prev => ({ ...prev, [itemId]: null }));
      }
    }
  };
  
  const handleRemoveItemImage = async (itemId: string, itemIndex: number) => {
    setPartImageFiles(prev => ({ ...prev, [itemId]: null })); // Clear any staged new file
    setImagePreviews(prev => ({ ...prev, [itemId]: null })); // Clear preview

    const currentItem = form.getValues(`items.${itemIndex}`);
    const existingImageUrl = currentItem?.imageUrl;

    // Update form state to remove imageUrl
    if (currentItem) {
        update(itemIndex, { ...currentItem, imageUrl: null });
    }

    // If this is an existing item being edited and it had an imageUrl,
    // it will be deleted from storage when the main form is submitted and the updateRequisitionMutation runs.
    // No immediate deletion from storage here, to allow "undo" by re-uploading before saving.
    if (editingRequisition && existingImageUrl) {
        toast({ title: "Imagem Marcada para Remoção", description: "A imagem será removida ao salvar a requisição."});
    }
  };

  const addItem = () => {
    append({
      id: crypto.randomUUID(),
      partName: "",
      quantity: 1,
      notes: "",
      imageUrl: null,
      status: "Pendente Aprovação",
    });
  };

  const removeItem = async (index: number, itemId: string) => {
    const itemToRemove = fields[index];
    // For newly added items not yet saved, or items where image was just staged:
    if (partImageFiles[itemId]) {
        // Just remove from local state, no storage interaction yet
        const newImageFiles = { ...partImageFiles };
        delete newImageFiles[itemId];
        setPartImageFiles(newImageFiles);
        const newImagePreviews = { ...imagePreviews };
        delete newImagePreviews[itemId];
        setImagePreviews(newImagePreviews);
    } else if (itemToRemove?.imageUrl && editingRequisition) {
        // If it's an existing item with a saved imageUrl,
        // it will be handled during the update mutation (by not including its URL).
        // The actual deletion from storage happens there.
        toast({ title: "Item Marcado para Remoção", description: "O item e sua imagem (se houver) serão removidos ao salvar." });
    }
    remove(index);
  };


  const addRequisitionMutation = useMutation({
    mutationFn: async (newRequisitionData: z.infer<typeof PartsRequisitionSchema>) => {
      if (!db) throw new Error("Firebase DB is not available.");
      
      const requisitionId = crypto.randomUUID(); // Generate client-side UUID for the new requisition

      const itemsWithImageUrls = await Promise.all(
        newRequisitionData.items.map(async (item) => {
          let imageUrl = item.imageUrl || null; // Should be null for new items unless handled differently
          const imageFile = item.id ? partImageFiles[item.id] : null;
          if (imageFile && item.id) {
            // For new requisitions, if imageUrl was somehow set, this would delete it.
            // But it should be null.
            if (imageUrl) await deletePartImageFromStorage(imageUrl);
            imageUrl = await uploadPartImageToStorage(imageFile, requisitionId, item.id);
          }
          return { ...item, imageUrl };
        })
      );

      // Prepare data for Firestore, ensuring not to include the client-side 'id' if your schema for Firestore doesn't expect it.
      // However, since we use setDoc, the ID is the first arg.
      const { id: formId, ...dataFromForm } = newRequisitionData; 

      const dataToSave = {
        ...dataFromForm, // contains requisitionNumber, serviceOrderId, technicianId, status, generalNotes from form
        createdDate: serverTimestamp(), // Firestore server-side timestamp
        items: itemsWithImageUrls, // Items with processed image URLs
        // Do not include 'id' here if Firestore auto-generates or if it's part of the doc path
      };
      
      await setDoc(doc(db, FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME, requisitionId), dataToSave);
      return { ...dataToSave, id: requisitionId }; // Return with the ID used for setDoc
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
      toast({ title: "Requisição Criada", description: `Requisição ${data.requisitionNumber} foi criada.` });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Criar Requisição", description: err.message, variant: "destructive" });
    },
  });

  const updateRequisitionMutation = useMutation({
    mutationFn: async (requisitionData: PartsRequisition) => {
      if (!db) throw new Error("Firebase DB is not available.");
      const { id, items, createdDate, ...dataToUpdate } = requisitionData; // Exclude createdDate from direct update
      if (!id) throw new Error("ID da requisição é necessário.");

      const originalRequisition = requisitions.find(r => r.id === id);
      if (!originalRequisition) throw new Error("Requisição original não encontrada para atualização.");

      const itemsWithImageUrls = await Promise.all(
        items.map(async (item) => {
          let imageUrl = item.imageUrl || null;
          const imageFile = item.id ? partImageFiles[item.id] : null;
          const originalItem = originalRequisition.items.find(orig => orig.id === item.id);

          if (imageFile && item.id) { // New image uploaded for this item
            if (originalItem?.imageUrl) { // If there was an old image, delete it
              await deletePartImageFromStorage(originalItem.imageUrl);
            }
            imageUrl = await uploadPartImageToStorage(imageFile, id, item.id);
          } else if (!imageUrl && originalItem?.imageUrl && item.id) { // Image was removed (imageUrl is null but original had one)
            await deletePartImageFromStorage(originalItem.imageUrl);
          }
          // If imageUrl exists and no new file, it means keep the existing one.
          return { ...item, imageUrl };
        })
      );
      
      // Delete images for items that were removed from the list entirely
      const currentItemIds = items.map(item => item.id);
      for (const originalItem of originalRequisition.items) {
          if (originalItem.id && !currentItemIds.includes(originalItem.id) && originalItem.imageUrl) {
              await deletePartImageFromStorage(originalItem.imageUrl);
          }
      }

      const reqRef = doc(db, FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME, id);
      // Do not update createdDate, keep the original one
      await updateDoc(reqRef, { ...dataToUpdate, items: itemsWithImageUrls });
      return { ...requisitionData, items: itemsWithImageUrls, createdDate: originalRequisition.createdDate };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
      toast({ title: "Requisição Atualizada", description: `Requisição ${data.requisitionNumber} foi atualizada.` });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Atualizar Requisição", description: err.message, variant: "destructive" });
    },
  });

  const deleteRequisitionMutation = useMutation({
    mutationFn: async (requisitionId: string) => {
      if (!db) throw new Error("Firebase DB is not available.");
      const reqToDelete = requisitions.find(r => r.id === requisitionId);
      if (reqToDelete?.items) {
        for (const item of reqToDelete.items) {
          if (item.imageUrl && item.id) { // Ensure item.id exists
            await deletePartImageFromStorage(item.imageUrl);
          }
        }
      }
      await deleteDoc(doc(db, FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME, requisitionId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
      toast({ title: "Requisição Excluída" });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Excluir Requisição", description: err.message, variant: "destructive" });
    },
  });


  const onSubmit = async (values: z.infer<typeof PartsRequisitionSchema>) => {
    if (editingRequisition && editingRequisition.id) {
      const updatedRequisition: PartsRequisition = {
        ...editingRequisition, // Spread original to keep createdDate and other potentially non-form fields
        ...values, // Spread validated form values (overwrites common fields)
        id: editingRequisition.id, // Ensure ID is correctly passed
      };
      updateRequisitionMutation.mutate(updatedRequisition);
    } else {
      addRequisitionMutation.mutate(values); // 'id' will be generated by the mutation
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingRequisition && editingRequisition.id) {
      if (window.confirm(`Tem certeza que deseja excluir a requisição "${editingRequisition.requisitionNumber}"? Esta ação não pode ser desfeita.`)) {
        deleteRequisitionMutation.mutate(editingRequisition.id);
      }
    }
  };
  
  const isLoadingPageData = isLoadingRequisitions || isLoadingServiceOrders || isLoadingTechnicians || isLoadingCustomers;
  const isMutating = addRequisitionMutation.isPending || updateRequisitionMutation.isPending || deleteRequisitionMutation.isPending;

  if (!db || !storage) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <PageHeader title="Erro de Conexão com Firebase" />
        <p className="text-lg text-center text-muted-foreground">
          Não foi possível conectar ao banco de dados ou ao serviço de armazenamento.
        </p>
      </div>
    );
  }

  if (isLoadingPageData && !isModalOpen) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Carregando dados...</p></div>;
  }
  if (isErrorRequisitions) {
    return <div className="text-red-500 p-4">Erro ao carregar requisições: {errorRequisitions?.message}</div>;
  }

  return (
    <>
      <PageHeader
        title="Minhas Requisições de Peças"
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nova Requisição
          </Button>
        }
      />

      {requisitions.length === 0 && !isLoadingRequisitions ? (
        <DataTablePlaceholder
          icon={Wrench}
          title="Nenhuma Requisição de Peças Criada"
          description="Crie sua primeira requisição de peças para uma Ordem de Serviço."
          buttonLabel="Criar Nova Requisição"
          onButtonClick={() => openModal()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requisitions.map((req) => {
            const serviceOrder = serviceOrders?.find(os => os.id === req.serviceOrderId);
            const technician = technicians?.find(t => t.id === req.technicianId);
            const customer = customers?.find(c => c.id === serviceOrder?.customerId);
            return (
              <Card key={req.id} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer" onClick={() => openModal(req)}>
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
                    OS: {serviceOrder?.orderNumber || req.serviceOrderId} | Cliente: {customer?.name || "N/A"}
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
                        <span className="font-medium text-muted-foreground mr-1">Obs. Geral:</span>
                        <span className="whitespace-pre-wrap break-words">{req.generalNotes}</span>
                    </p>
                  )}
                  <div>
                    <h4 className="text-sm font-semibold mb-1 mt-2">Itens Solicitados: ({req.items.length})</h4>
                    <ul className="space-y-2 max-h-40 overflow-y-auto pr-2">
                      {req.items.map(item => (
                        <li key={item.id} className="p-2 border rounded-md bg-muted/30 text-xs">
                          <div className="flex justify-between items-start">
                            <span className="font-medium">{item.partName} (Qtd: {item.quantity})</span>
                            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-semibold", {
                                "bg-yellow-200 text-yellow-800": item.status === "Pendente Aprovação",
                                "bg-green-200 text-green-800": item.status === "Aprovado" || item.status === "Separado" || item.status === "Entregue",
                                "bg-red-200 text-red-800": item.status === "Recusado",
                                "bg-blue-200 text-blue-800": item.status === "Aguardando Compra",
                            })}>
                                {item.status}
                            </span>
                          </div>
                          {item.notes && <p className="text-muted-foreground mt-0.5">Obs: {item.notes}</p>}
                          {item.imageUrl && (
                            <div className="mt-1.5">
                                <Image src={item.imageUrl} alt={`Imagem de ${item.partName}`} width={40} height={40} className="rounded object-cover aspect-square" data-ai-hint="product part"/>
                            </div>
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

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingRequisition ? "Editar Requisição de Peças" : "Criar Nova Requisição de Peças"}
        description="Preencha os detalhes da requisição e adicione as peças necessárias."
        formId="parts-requisition-form"
        isSubmitting={isMutating}
        editingItem={editingRequisition}
        onDeleteConfirm={handleModalDeleteConfirm}
        isDeleting={deleteRequisitionMutation.isPending}
        deleteButtonLabel="Excluir Requisição"
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="parts-requisition-form" className="space-y-6">
            <fieldset disabled={!!editingRequisition && !isEditMode} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="requisitionNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número da Requisição</FormLabel>
                    <FormControl><Input {...field} readOnly className="bg-muted/50" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="serviceOrderId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordem de Serviço Vinculada</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || NO_SERVICE_ORDER_SELECTED} disabled={!!editingRequisition}>
                      <FormControl><SelectTrigger>
                        <SelectValue placeholder={isLoadingServiceOrders ? "Carregando OS..." : "Selecione uma OS"} />
                      </SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NO_SERVICE_ORDER_SELECTED} disabled>Selecione uma OS</SelectItem>
                        {serviceOrders?.map(os => (
                          <SelectItem key={os.id} value={os.id}>
                            OS: {os.orderNumber} (Cliente: {customers?.find(c=>c.id === os.customerId)?.name || 'N/A'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="technicianId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Técnico Solicitante</FormLabel>
                   <Select onValueChange={field.onChange} value={field.value || NO_TECHNICIAN_SELECTED} disabled={!!editingRequisition}>
                    <FormControl><SelectTrigger>
                      <SelectValue placeholder={isLoadingTechnicians ? "Carregando Técnicos..." : "Selecione o Técnico"} />
                    </SelectTrigger></FormControl>
                    <SelectContent>
                       <SelectItem value={NO_TECHNICIAN_SELECTED} disabled>Selecione o Técnico</SelectItem>
                      {technicians?.map(tech => (
                        <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
               <FormField control={form.control} name="generalNotes" render={({ field }) => (
                <FormItem><FormLabel>Observações Gerais (Opcional)</FormLabel><FormControl><Textarea placeholder="Notas gerais sobre a requisição..." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />

              <div>
                <h3 className="text-md font-semibold mb-2 mt-4 border-b pb-1 font-headline">Itens da Requisição</h3>
                {fields.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-12 gap-x-3 gap-y-2 items-start border-b py-3">
                    <FormField control={form.control} name={`items.${index}.partName`} render={({ field }) => (
                      <FormItem className="col-span-12 sm:col-span-6 md:col-span-4">
                        {index === 0 && <FormLabel>Nome da Peça</FormLabel>}
                        <FormControl><Input placeholder="Ex: Filtro de óleo" {...field} /></FormControl><FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                      <FormItem className="col-span-6 sm:col-span-3 md:col-span-2">
                        {index === 0 && <FormLabel>Qtd.</FormLabel>}
                        <FormControl><Input type="number" placeholder="1" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || 0)} /></FormControl><FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name={`items.${index}.notes`} render={({ field }) => (
                      <FormItem className="col-span-12 sm:col-span-6 md:col-span-4">
                         {index === 0 && <FormLabel>Obs. Item (Opcional)</FormLabel>}
                        <FormControl><Input placeholder="Detalhes da peça" {...field} value={field.value ?? ""} /></FormControl><FormMessage />
                      </FormItem>
                    )} />
                    <div className="col-span-10 sm:col-span-9 md:col-span-10">
                      {index === 0 && <FormLabel>Imagem (Opcional)</FormLabel>}
                      <div className="flex items-center gap-2">
                        <Input
                            id={`items.${index}.imageFile`}
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleItemImageChange(item.id!, e.target.files ? e.target.files[0] : null)}
                            className="text-xs"
                            disabled={!!editingRequisition && !isEditMode && !!item.imageUrl}
                        />
                        {item.id && imagePreviews[item.id] && (
                            <div className="relative group">
                                <Image src={imagePreviews[item.id]!} alt="Preview" width={32} height={32} className="rounded object-cover aspect-square" data-ai-hint="part preview"/>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleRemoveItemImage(item.id!, index)}
                                >
                                    <XCircle className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                      </div>
                       {item.imageUrl && !partImageFiles[item.id!] && !imagePreviews[item.id!] && ( // Show link to existing image if no new preview
                          <Link href={item.imageUrl} target="_blank" className="text-xs text-primary hover:underline mt-1 block">Ver imagem atual: {getFileNameFromUrl(item.imageUrl)}</Link>
                        )}
                    </div>
                    <div className="col-span-2 sm:col-span-3 md:col-span-2 flex justify-end items-end h-full">
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index, item.id!)} className="text-destructive hover:text-destructive self-center sm:self-end">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Controller
                        name={`items.${index}.imageUrl`}
                        control={form.control}
                        render={({ field: imageUrlField }) => <input type="hidden" {...imageUrlField} />}
                    />
                     <Controller
                        name={`items.${index}.id`}
                        control={form.control}
                        render={({ field: idField }) => <input type="hidden" {...idField} />}
                    />
                     <Controller
                        name={`items.${index}.status`}
                        control={form.control}
                        render={({ field: statusField }) => <input type="hidden" {...statusField} />}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="mt-3">
                  <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Peça
                </Button>
              </div>
            </fieldset>
          </form>
        </Form>
      </FormModal>
    </>
  );
}

    