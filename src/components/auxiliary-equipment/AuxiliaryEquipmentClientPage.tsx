
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, PackageSearch, Edit, Trash2, Tag, CheckCircle, Construction, Link as LinkIconLI, FileText, Package, ShieldAlert, Loader2, AlertTriangle, Box, BatteryCharging, Anchor, MapPin, Image as ImageIcon, UploadCloud, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import NextImage from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import type { AuxiliaryEquipment, Maquina } from "@/types";
import { AuxiliaryEquipmentSchema, auxiliaryEquipmentTypeOptions, auxiliaryEquipmentStatusOptions } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch, setDoc, where } from "firebase/firestore";
import { ref as storageRefFB, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, getFileNameFromUrl } from "@/lib/utils";

const FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME = "equipamentosAuxiliares";
const FIRESTORE_MAQUINAS_COLLECTION_NAME = "equipamentos";
const MAX_AUX_IMAGE_FILES = 5;

const CUSTOM_AUXILIARY_TYPE_VALUE = "_CUSTOM_";

const statusIcons: Record<typeof auxiliaryEquipmentStatusOptions[number], JSX.Element> = {
  Disponível: <CheckCircle className="h-4 w-4 text-green-500" />,
  Locado: <Package className="h-4 w-4 text-blue-500" />,
  'Em Manutenção': <ShieldAlert className="h-4 w-4 text-yellow-500" />,
  Sucata: <Trash2 className="h-4 w-4 text-red-500" />,
};

const typeIcons: Record<string, LucideIcon> = {
  Bateria: BatteryCharging,
  Carregador: Box,
  Berço: Anchor,
  Cabo: LinkIconLI,
  Outro: PackageSearch,
};

interface AuxiliaryEquipmentClientPageProps {
  auxEquipmentIdFromUrl?: string | null;
}

async function uploadAuxiliaryImageFile(
  file: File,
  auxEquipmentId: string,
  fileNameSuffix: string
): Promise<string> {
  if (!storage) {
    throw new Error("Firebase Storage connection not available.");
  }
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `auxiliary_equipment_images/${auxEquipmentId}/${fileNameSuffix}-${sanitizedFileName}`;
  const fileStorageRef = storageRefFB(storage!, filePath);
  await uploadBytes(fileStorageRef, file);
  return getDownloadURL(fileStorageRef);
}

async function deleteAuxiliaryImageFromStorage(fileUrl?: string | null) {
  if (fileUrl) {
    if (!storage) {
      console.warn("deleteAuxiliaryImageFromStorage: Firebase Storage connection not available. Skipping deletion.");
      return;
    }
    try {
      const gcsPath = new URL(fileUrl).pathname.split('/o/')[1].split('?')[0];
      const decodedPath = decodeURIComponent(gcsPath);
      const fileStorageRef = storageRefFB(storage!, decodedPath);
      await deleteObject(fileStorageRef);
    } catch (e: any) {
      if (e.code === 'storage/object-not-found') {
        console.warn(`[DELETE AUX IMG] File not found, skipping: ${fileUrl}`);
      } else {
        console.error(`[DELETE AUX IMG] Failed to delete file: ${fileUrl}`, e);
      }
    }
  }
}

async function fetchAuxiliaryEquipment(): Promise<AuxiliaryEquipment[]> {
  if (!db) {
    console.error("fetchAuxiliaryEquipment: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : null,
    } as AuxiliaryEquipment;
  });
}

async function fetchMaquinasPrincipais(): Promise<Maquina[]> {
  if (!db) {
    console.error("fetchMaquinasPrincipais: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db, FIRESTORE_MAQUINAS_COLLECTION_NAME), orderBy("brand", "asc"), orderBy("model", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Maquina));
}

export function AuxiliaryEquipmentClientPage({ auxEquipmentIdFromUrl }: AuxiliaryEquipmentClientPageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AuxiliaryEquipment | null>(null);
  const [showCustomTypeField, setShowCustomTypeField] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [imageFilesToUpload, setImageFilesToUpload] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);


  const form = useForm<z.infer<typeof AuxiliaryEquipmentSchema>>({
    resolver: zodResolver(AuxiliaryEquipmentSchema),
    defaultValues: {
      name: "",
      type: "",
      customType: "",
      serialNumber: "",
      status: "Disponível",
      notes: "",
      imageUrls: [],
    },
  });

  const { data: auxEquipmentList = [], isLoading: isLoadingAux, isError: isErrorAux, error: errorAux } = useQuery<AuxiliaryEquipment[], Error>({
    queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME],
    queryFn: fetchAuxiliaryEquipment,
    enabled: !!db,
  });

  const { data: maquinasPrincipaisList = [], isLoading: isLoadingMaquinasPrincipais } = useQuery<Maquina[], Error>({
    queryKey: [FIRESTORE_MAQUINAS_COLLECTION_NAME],
    queryFn: fetchMaquinasPrincipais,
    enabled: !!db,
  });

  const openModal = useCallback((item?: AuxiliaryEquipment) => {
    setImageFilesToUpload([]);
    setImagePreviews(item?.imageUrls || []);
    if (item) {
      setEditingItem(item);
      setIsEditMode(false); // Start in view mode for existing items
      const isTypePredefined = auxiliaryEquipmentTypeOptions.includes(item.type as any);
      form.reset({
        name: item.name,
        type: isTypePredefined ? item.type : CUSTOM_AUXILIARY_TYPE_VALUE,
        customType: isTypePredefined ? "" : item.type,
        serialNumber: item.serialNumber || "",
        status: item.status,
        notes: item.notes || "",
        imageUrls: item.imageUrls || [],
      });
      setShowCustomTypeField(!isTypePredefined);
    } else {
      setEditingItem(null);
      setIsEditMode(true); // Start in edit mode for new items
      form.reset({
        name: "", type: "", customType: "", serialNumber: "",
        status: "Disponível", notes: "", imageUrls: [],
      });
      setShowCustomTypeField(false);
    }
    setIsModalOpen(true);
  }, [form]);


  useEffect(() => {
    if (auxEquipmentIdFromUrl && !isLoadingAux && auxEquipmentList.length > 0 && !isModalOpen) {
      const itemToEdit = auxEquipmentList.find(eq => eq.id === auxEquipmentIdFromUrl);
      if (itemToEdit) {
        openModal(itemToEdit);
        if (typeof window !== "undefined") {
           window.history.replaceState(null, '', '/auxiliary-equipment');
        }
      }
    }
  }, [auxEquipmentIdFromUrl, auxEquipmentList, isLoadingAux, openModal, isModalOpen]);


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

  const addAuxEquipmentMutation = useMutation({
    mutationFn: async (data: { formData: z.infer<typeof AuxiliaryEquipmentSchema>; newImageFiles: File[] }) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para adicionar equipamento auxiliar.");
      setIsUploadingFiles(true);
      const newAuxEquipmentId = doc(collection(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME)).id;
      const uploadedImageUrls: string[] = [];

      for (let i = 0; i < data.newImageFiles.length; i++) {
        const file = data.newImageFiles[i];
        const imageUrl = await uploadAuxiliaryImageFile(file, newAuxEquipmentId, `image_${Date.now()}_${i}`);
        uploadedImageUrls.push(imageUrl);
      }

      const { customType, ...dataToSave } = data.formData;
      const finalData = {
        ...dataToSave,
        type: dataToSave.type === CUSTOM_AUXILIARY_TYPE_VALUE ? customType || "Outro" : dataToSave.type,
        serialNumber: dataToSave.serialNumber || null,
        notes: dataToSave.notes || null,
        imageUrls: uploadedImageUrls,
      };
      await setDoc(doc(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, newAuxEquipmentId), finalData);
      return { ...finalData, id: newAuxEquipmentId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      toast({ title: "Equipamento Auxiliar Adicionado", description: `${data.name} foi adicionado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Adicionar", description: `Não foi possível adicionar ${variables.formData.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
    onSettled: () => setIsUploadingFiles(false),
  });

  const updateAuxEquipmentMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      formData: z.infer<typeof AuxiliaryEquipmentSchema>;
      newImageFiles: File[];
      existingImageUrlsToKeep: string[];
      currentAuxEquipment: AuxiliaryEquipment;
    }) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para atualizar equipamento auxiliar.");
      setIsUploadingFiles(true);
      const finalImageUrls: string[] = [...data.existingImageUrlsToKeep];

      for (let i = 0; i < data.newImageFiles.length; i++) {
        const file = data.newImageFiles[i];
        const imageUrl = await uploadAuxiliaryImageFile(file, data.id, `image_${Date.now()}_${i}`);
        finalImageUrls.push(imageUrl);
      }

      const urlsToDeleteFromStorage = (data.currentAuxEquipment.imageUrls || []).filter(
        (url) => !data.existingImageUrlsToKeep.includes(url)
      );
      for (const url of urlsToDeleteFromStorage) {
        await deleteAuxiliaryImageFromStorage(url);
      }

      const { customType, ...dataToSave } = data.formData;
      const finalData = {
        name: dataToSave.name,
        type: dataToSave.type === CUSTOM_AUXILIARY_TYPE_VALUE ? customType || "Outro" : dataToSave.type,
        serialNumber: dataToSave.serialNumber || null,
        status: dataToSave.status,
        notes: dataToSave.notes || null,
        linkedEquipmentId: data.currentAuxEquipment.linkedEquipmentId,
        imageUrls: finalImageUrls,
      };

      const itemRef = doc(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, data.id);
      await updateDoc(itemRef, finalData as { [x: string]: any });
      return { ...finalData, id: data.id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      toast({ title: "Equipamento Auxiliar Atualizado", description: `${data.name} foi atualizado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar", description: `Não foi possível atualizar ${variables.formData.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
    onSettled: () => setIsUploadingFiles(false),
  });

  const deleteAuxEquipmentMutation = useMutation({
    mutationFn: async (itemToDelete: AuxiliaryEquipment) => {
      if (!db) {
        throw new Error("Conexão com Firebase não disponível para excluir equipamento auxiliar.");
      }
      if (!itemToDelete.id) {
        throw new Error("ID do item é necessário para exclusão.");
      }

      if (itemToDelete.imageUrls) {
        for (const url of itemToDelete.imageUrls) {
          await deleteAuxiliaryImageFromStorage(url);
        }
      }

      const batch = writeBatch(db);
      const auxRef = doc(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, itemToDelete.id);
      batch.delete(auxRef);

      const maquinasQuery = query(
        collection(db, FIRESTORE_MAQUINAS_COLLECTION_NAME),
        where("linkedAuxiliaryEquipmentIds", "array-contains", itemToDelete.id)
      );
      const maquinasSnapshot = await getDocs(maquinasQuery);

      maquinasSnapshot.forEach(maquinaDoc => {
        const maquinaData = maquinaDoc.data() as Maquina;
        const updatedLinkedIds = (maquinaData.linkedAuxiliaryEquipmentIds || []).filter(id => id !== itemToDelete.id);
        batch.update(doc(db, FIRESTORE_MAQUINAS_COLLECTION_NAME, maquinaDoc.id), { linkedAuxiliaryEquipmentIds: updatedLinkedIds });
      });

      await batch.commit();
      return itemToDelete.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_MAQUINAS_COLLECTION_NAME] });
      toast({ title: "Equipamento Auxiliar Excluído", description: `O item foi removido.` });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Excluir", description: `Não foi possível excluir o item. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });


  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    form.reset();
    setShowCustomTypeField(false);
    setIsEditMode(false);
    setImageFilesToUpload([]);
    setImagePreviews([]);
  };

  const onSubmit = async (values: z.infer<typeof AuxiliaryEquipmentSchema>) => {
    const existingImageUrlsToKeep = imagePreviews.filter(
      (url) => (editingItem?.imageUrls || []).includes(url) && url.startsWith('https://firebasestorage.googleapis.com')
    );

    if (editingItem && editingItem.id) {
      updateAuxEquipmentMutation.mutate({
        id: editingItem.id,
        formData: values,
        newImageFiles: imageFilesToUpload,
        existingImageUrlsToKeep,
        currentAuxEquipment: editingItem,
      });
    } else {
      addAuxEquipmentMutation.mutate({ formData: values, newImageFiles: imageFilesToUpload });
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingItem && editingItem.id) {
      if (window.confirm(`Tem certeza que deseja excluir o equipamento auxiliar "${editingItem.name}"? Esta ação também o desvinculará de qualquer máquina e removerá suas imagens.`)) {
        deleteAuxEquipmentMutation.mutate(editingItem);
      }
    }
  };

  const handleTypeChange = (value: string) => {
    form.setValue('type', value);
    setShowCustomTypeField(value === CUSTOM_AUXILIARY_TYPE_VALUE);
    if (value !== CUSTOM_AUXILIARY_TYPE_VALUE) {
      form.setValue('customType', "");
    }
  };

  const getLinkedMaquinaName = (maquinaId?: string | null): string => {
    if (!maquinaId || !maquinasPrincipaisList) return "Nenhuma";
    const maquina = maquinasPrincipaisList.find(eq => eq.id === maquinaId);
    return maquina ? `${maquina.brand} ${maquina.model} (${maquina.chassisNumber})` : "Não encontrada";
  };

  const handleImageFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const currentTotalFiles = imagePreviews.length + imageFilesToUpload.length - (editingItem?.imageUrls?.filter(url => imagePreviews.includes(url)).length || 0) + files.length;

      if (currentTotalFiles > MAX_AUX_IMAGE_FILES) {
        toast({
          title: "Limite de Imagens Excedido",
          description: `Você pode ter no máximo ${MAX_AUX_IMAGE_FILES} imagens.`,
          variant: "destructive",
        });
        return;
      }
      const newFilesArray = Array.from(files);
      setImageFilesToUpload(prev => [...prev, ...newFilesArray]);
      newFilesArray.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveAuxImage = (index: number, isExistingUrl: boolean) => {
    if (isExistingUrl) {
      const urlToRemove = imagePreviews[index];
      setImagePreviews(prev => prev.filter((_, i) => i !== index));
      const currentFormUrls = form.getValues('imageUrls') || [];
      form.setValue('imageUrls', currentFormUrls.filter(url => url !== urlToRemove), {shouldDirty: true});
    } else {
      // This logic needs to correctly identify the index in imageFilesToUpload
      // based on its corresponding previewUrl (which is a data URI for new files)
      const urlToRemove = imagePreviews[index]; // This is the data URI of the new file preview
      setImageFilesToUpload(prevFiles => {
        // Find the file in imageFilesToUpload that corresponds to this data URI
        // This might require storing the original File object alongside its preview URL if direct comparison isn't feasible
        // For simplicity here, we'll assume the order is maintained or a more complex lookup is needed.
        // A more robust way would be to assign a temporary ID to each new file and its preview.
        // For now, let's try a simpler approach by finding the file that created this preview (if possible) or by index if order is reliable.

        // Assuming the order of imagePreviews directly corresponds to [existingCloudUrls..., newLocalFilePreviews...]
        // and the order of imageFilesToUpload corresponds to newLocalFilePreviews
        const numExistingUrlsStillInPreview = (editingItem?.imageUrls || []).filter(url => imagePreviews.includes(url)).length;
        const fileIndexInUploadArray = index - numExistingUrlsStillInPreview;

        if (fileIndexInUploadArray >= 0 && fileIndexInUploadArray < prevFiles.length) {
           return prevFiles.filter((_, i) => i !== fileIndexInUploadArray);
        }
        return prevFiles; // Should not happen if logic is correct
      });
      setImagePreviews(prev => prev.filter((_, i) => i !== index));
    }
  };


  const isLoadingPageData = isLoadingAux || isLoadingMaquinasPrincipais;
  const isMutatingAll = addAuxEquipmentMutation.isPending || updateAuxEquipmentMutation.isPending || deleteAuxEquipmentMutation.isPending || isUploadingFiles;

  if (isLoadingPageData && !isModalOpen) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Carregando dados...</p>
      </div>
    );
  }

  if (isErrorAux) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Equipamentos Auxiliares</h2>
        <p className="text-center">Não foi possível buscar os dados. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: {errorAux?.message}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title=""
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutatingAll}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Equip. Auxiliar
          </Button>
        }
      />
      <p className="text-muted-foreground text-sm mb-6 -mt-4">
        Cadastre e controle equipamentos auxiliares como baterias, carregadores e outros itens vinculados às suas máquinas principais.
      </p>

      {auxEquipmentList.length === 0 && !isLoadingAux ? (
        <DataTablePlaceholder
          icon={PackageSearch}
          title="Nenhum Equipamento Auxiliar Registrado"
          description="Adicione seu primeiro equipamento auxiliar para começar."
          buttonLabel="Adicionar Equip. Auxiliar"
          onButtonClick={() => openModal()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {auxEquipmentList.map((item) => {
            const SpecificTypeIcon = typeIcons[item.type] || PackageSearch;
            const linkedMaquinaName = getLinkedMaquinaName(item.linkedEquipmentId);
            const primaryImageUrl = item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls[0] : null;
            return (
            <Card
              key={item.id}
              className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer"
              onClick={() => openModal(item)}
            >
              <CardHeader>
                 {primaryImageUrl ? (
                    <div className="relative w-full h-32 mb-2 rounded-t-md overflow-hidden">
                        <NextImage
                            src={primaryImageUrl}
                            alt={`Imagem de ${item.name}`}
                            layout="fill"
                            objectFit="cover"
                            data-ai-hint="auxiliary equipment"
                        />
                    </div>
                ) : (
                    <div className="flex items-center justify-center w-full h-32 mb-2 rounded-t-md bg-muted">
                        <ImageIcon className="w-10 h-10 text-muted-foreground" />
                    </div>
                )}
                <CardTitle className="font-headline text-xl text-primary flex items-center">
                  <SpecificTypeIcon className="mr-2 h-5 w-5" /> {item.name}
                </CardTitle>
                <CardDescription>Tipo: {item.type}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-2 text-sm">
                {item.serialNumber && (
                  <p className="flex items-center">
                    <Tag className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Nº Série:</span>
                    {item.serialNumber}
                  </p>
                )}
                <p className="flex items-center">
                  {statusIcons[item.status]}
                  <span className="font-medium text-muted-foreground ml-2 mr-1">Status:</span>
                   <span className={cn({
                    'text-green-600': item.status === 'Disponível',
                    'text-blue-600': item.status === 'Locado',
                    'text-yellow-600': item.status === 'Em Manutenção',
                     'text-red-600': item.status === 'Sucata',
                  })}>
                    {item.status}
                  </span>
                </p>
                {item.linkedEquipmentId && (
                  <p className="flex items-center">
                    <Construction className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Vinculado a:</span>
                    {isLoadingMaquinasPrincipais ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                      <Link
                        href={`/maquinas?openMaquinaId=${item.linkedEquipmentId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                        title={`Ver detalhes de ${linkedMaquinaName}`}
                      >
                        {linkedMaquinaName}
                      </Link>
                    )}
                  </p>
                )}
                {item.notes && (
                  <p className="flex items-start">
                    <FileText className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Obs.:</span>
                    <span className="whitespace-pre-wrap break-words">{item.notes}</span>
                  </p>
                )}
              </CardContent>
              <CardFooter className="border-t pt-4">
              </CardFooter>
            </Card>
          )})}
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingItem ? "Editar Equipamento Auxiliar" : "Adicionar Novo Equip. Auxiliar"}
        description="Forneça os detalhes do equipamento auxiliar e adicione imagens se necessário."
        formId="aux-equipment-form"
        isSubmitting={isMutatingAll}
        editingItem={editingItem}
        onDeleteConfirm={handleModalDeleteConfirm}
        isDeleting={deleteAuxEquipmentMutation.isPending}
        deleteButtonLabel="Excluir Equip. Auxiliar"
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="aux-equipment-form" className="space-y-4">
            <fieldset disabled={!!editingItem && !isEditMode} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Nome do Equipamento</FormLabel><FormControl><Input placeholder="Ex: Bateria Tracionária 80V" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={handleTypeChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {auxiliaryEquipmentTypeOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      <SelectItem value={CUSTOM_AUXILIARY_TYPE_VALUE}>Outro (Especificar)</SelectItem>
                    </SelectContent>
                  </Select>
                  {showCustomTypeField && (
                    <FormField control={form.control} name="customType" render={({ field: customField }) => (
                      <FormItem className="mt-2">
                        <FormControl><Input placeholder="Digite o tipo" {...customField} value={customField.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="serialNumber" render={({ field }) => (
                <FormItem><FormLabel>Número de Série (Opcional)</FormLabel><FormControl><Input placeholder="Nº de série único, se houver" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {auxiliaryEquipmentStatusOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />

              <h3 className="text-md font-semibold pt-4 border-b pb-1 font-headline">Imagens (Máx. {MAX_AUX_IMAGE_FILES})</h3>
                <FormItem>
                    <FormLabel htmlFor="aux-equipment-images-upload">Adicionar Imagens</FormLabel>
                    <FormControl>
                        <Input
                            id="aux-equipment-images-upload"
                            type="file"
                            multiple
                            accept="image/jpeg, image/png, image/webp"
                            onChange={handleImageFilesChange}
                            disabled={isUploadingFiles || imageFilesToUpload.length + (form.getValues('imageUrls')?.filter(url => url).length || 0) >= MAX_AUX_IMAGE_FILES}
                        />
                    </FormControl>
                    <FormDescription>
                        Total de imagens: {imagePreviews.length } de {MAX_AUX_IMAGE_FILES}.
                    </FormDescription>
                    <FormMessage />
                </FormItem>
                {(imagePreviews.length > 0) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                        {imagePreviews.map((previewUrl, index) => {
                             if (!previewUrl) return null;
                            const isExisting = (editingItem?.imageUrls || []).includes(previewUrl) && previewUrl.startsWith('https://firebasestorage.googleapis.com');
                            return (
                                <div key={`preview-${index}-${previewUrl.slice(-10)}`} className="relative group aspect-square">
                                    <NextImage
                                        src={previewUrl}
                                        alt={`Preview ${index + 1}`}
                                        layout="fill"
                                        objectFit="cover"
                                        className="rounded-md"
                                        data-ai-hint="auxiliary equipment product"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground opacity-80 hover:opacity-100 transition-opacity"
                                        onClick={() => handleRemoveAuxImage(index, isExisting)}
                                        title={isExisting ? "Remover imagem existente (será excluída ao salvar)" : "Remover nova imagem"}
                                    >
                                        <XCircle className="h-4 w-4" />
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
              <FormField control={form.control} name="imageUrls" render={({ field }) => <input type="hidden" {...field} value={(field.value as string[] | null | undefined) || []} />} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações (Opcional)</FormLabel><FormControl><Textarea placeholder="Detalhes adicionais sobre o equipamento" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>
          </form>
        </Form>
      </FormModal>
    </>
  );
}
