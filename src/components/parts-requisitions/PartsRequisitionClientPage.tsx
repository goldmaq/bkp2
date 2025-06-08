
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
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, Timestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PartsRequisition, PartsRequisitionItem, ServiceOrder, Technician } from "@/types";
import { PartsRequisitionSchema, PartsRequisitionItemSchema } from "@/types";
import { cn, formatDateForDisplay, formatDateForInput, getFileNameFromUrl } from "@/lib/utils";

const FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME = "partsRequisitions";
const FIRESTORE_SERVICE_ORDER_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";

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
    const imageRef = storageRef(storage, imageUrl);
    await deleteObject(imageRef);
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      console.warn("Image not found in storage, skipping deletion:", imageUrl);
    } else {
      console.error("Error deleting image from storage:", error);
      // Optionally re-throw or handle more gracefully
    }
  }
}


export function PartsRequisitionClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRequisition, setEditingRequisition] = useState<PartsRequisition | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [partImageFiles, setPartImageFiles] = useState<Record<string, File | null>>({}); // { 'itemId': File }
  const [imagePreviews, setImagePreviews] = useState<Record<string, string | null>>({}); // { 'itemId': 'dataURL' }

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

  const openModal = useCallback((requisition?: PartsRequisition) => {
    setPartImageFiles({});
    setImagePreviews({});
    if (requisition) {
      setEditingRequisition(requisition);
      setIsEditMode(false);
      form.reset({
        ...requisition,
        serviceOrderId: requisition.serviceOrderId || NO_SERVICE_ORDER_SELECTED,
        technicianId: requisition.technicianId || NO_TECHNICIAN_SELECTED,
        items: requisition.items.map(item => ({...item, id: item.id || crypto.randomUUID()})),
      });
      const previews: Record<string, string> = {};
      requisition.items.forEach(item => {
        if (item.imageUrl) previews[item.id] = item.imageUrl;
      });
      setImagePreviews(previews);
    } else {
      setEditingRequisition(null);
      setIsEditMode(true);
      form.reset({
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
      // If file is null (removed), check if there was an existing imageUrl to keep
      const currentItem = fields.find(f => f.id === itemId);
      if (currentItem && currentItem.imageUrl) {
        setImagePreviews(prev => ({ ...prev, [itemId]: currentItem.imageUrl }));
      } else {
        setImagePreviews(prev => ({ ...prev, [itemId]: null }));
      }
    }
  };

  const handleRemoveItemImage = (itemId: string, itemIndex: number) => {
    setPartImageFiles(prev => ({ ...prev, [itemId]: null }));
    setImagePreviews(prev => ({ ...prev, [itemId]: null }));
    // Also update the form to set imageUrl to null for this item
    const currentItem = form.getValues(`items.${itemIndex}`);
    if (currentItem) {
        update(itemIndex, { ...currentItem, imageUrl: null });
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
    if (itemToRemove?.imageUrl) {
        // No need to await here, let it happen in background
        deletePartImageFromStorage(itemToRemove.imageUrl).catch(err => console.error("Failed to delete image on item remove", err));
    }
    remove(index);
    const newImageFiles = { ...partImageFiles };
    delete newImageFiles[itemId];
    setPartImageFiles(newImageFiles);
    const newImagePreviews = { ...imagePreviews };
    delete newImagePreviews[itemId];
    setImagePreviews(newImagePreviews);
  };


  const addRequisitionMutation = useMutation({
    mutationFn: async (newRequisitionData: z.infer<typeof PartsRequisitionSchema>) => {
      if (!db) throw new Error("Firebase DB is not available.");
      const requisitionId = doc(collection(db, FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME)).id;
      
      const itemsWithImageUrls = await Promise.all(
        newRequisitionData.items.map(async (item) => {
          let imageUrl = item.imageUrl || null;
          const imageFile = partImageFiles[item.id];
          if (imageFile) {
            if (imageUrl) await deletePartImageFromStorage(imageUrl); // Delete old if exists
            imageUrl = await uploadPartImageToStorage(imageFile, requisitionId, item.id);
          }
          return { ...item, imageUrl };
        })
      );

      const dataToSave = {
        ...newRequisitionData,
        id: requisitionId, // ensure ID is part of the saved data for consistency
        createdDate: serverTimestamp(),
        items: itemsWithImageUrls,
      };
      await addDoc(collection(db, FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME), dataToSave);
      return dataToSave;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
      toast({ title: "Requisição Criada", description: `Requisição ${data.requisitionNumber} foi criada.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Criar Requisição", description: err.message, variant: "destructive" });
    },
  });

  const updateRequisitionMutation = useMutation({
    mutationFn: async (requisitionData: PartsRequisition) => {
      if (!db) throw new Error("Firebase DB is not available.");
      const { id, items, ...dataToUpdate } = requisitionData;
      if (!id) throw new Error("ID da requisição é necessário.");

      const itemsWithImageUrls = await Promise.all(
        items.map(async (item) => {
          let imageUrl = item.imageUrl || null;
          const imageFile = partImageFiles[item.id];
          const originalItem = editingRequisition?.items.find(orig => orig.id === item.id);

          if (imageFile) { // New image uploaded
            if (originalItem?.imageUrl) {
              await deletePartImageFromStorage(originalItem.imageUrl);
            }
            imageUrl = await uploadPartImageToStorage(imageFile, id, item.id);
          } else if (!imageFile && originalItem?.imageUrl && !item.imageUrl) { // Image was removed (imageUrl set to null in form)
            await deletePartImageFromStorage(originalItem.imageUrl);
            imageUrl = null;
          }
          // If no new file and imageUrl exists, it means keep existing image or it was already null.
          return { ...item, imageUrl };
        })
      );
      
      const reqRef = doc(db, FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME, id);
      await updateDoc(reqRef, { ...dataToUpdate, items: itemsWithImageUrls });
      return { ...requisitionData, items: itemsWithImageUrls };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_PARTS_REQUISITION_COLLECTION_NAME] });
      toast({ title: "Requisição Atualizada", description: `Requisição ${data.requisitionNumber} foi atualizada.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar Requisição", description: err.message, variant: "destructive" });
    },
  });

  const deleteRequisitionMutation = useMutation({
    mutationFn: async (requisitionId: string) => {
      if (!db) throw new Error("Firebase DB is not available.");
      const reqToDelete = requisitions.find(r => r.id === requisitionId);
      if (reqToDelete?.items) {
        for (const item of reqToDelete.items) {
          if (item.imageUrl) {
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
      updateRequisitionMutation.mutate({ ...values, id: editingRequisition.id, createdDate: editingRequisition.createdDate });
    } else {
      addRequisitionMutation.mutate(values);
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingRequisition && editingRequisition.id) {
      if (window.confirm(`Tem certeza que deseja excluir a requisição "${editingRequisition.requisitionNumber}"?`)) {
        deleteRequisitionMutation.mutate(editingRequisition.id);
      }
    }
  };
  
  const isLoadingPageData = isLoadingRequisitions || isLoadingServiceOrders || isLoadingTechnicians;
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
                    OS: {serviceOrder?.orderNumber || req.serviceOrderId} | Técnico: {technician?.name || req.technicianId}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-3 text-sm">
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
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold
                              bg-slate-200 text-slate-700
                            ">{item.status}</span>
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
                            onChange={(e) => handleItemImageChange(item.id, e.target.files ? e.target.files[0] : null)}
                            className="text-xs"
                            disabled={!!editingRequisition && !isEditMode && !!item.imageUrl}
                        />
                        {imagePreviews[item.id] && (
                            <div className="relative group">
                                <Image src={imagePreviews[item.id]!} alt="Preview" width={32} height={32} className="rounded object-cover aspect-square" data-ai-hint="product part"/>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100"
                                    onClick={() => handleRemoveItemImage(item.id, index)}
                                >
                                    <XCircle className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                      </div>
                       {item.imageUrl && !partImageFiles[item.id] && !imagePreviews[item.id] && ( // Show existing if no new preview and URL exists
                          <Link href={item.imageUrl} target="_blank" className="text-xs text-primary hover:underline mt-1 block">Ver imagem atual</Link>
                        )}
                    </div>
                    <div className="col-span-2 sm:col-span-3 md:col-span-2 flex justify-end items-end h-full">
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index, item.id)} className="text-destructive hover:text-destructive self-center sm:self-end">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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

    