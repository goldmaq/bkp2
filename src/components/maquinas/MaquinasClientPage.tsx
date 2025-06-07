
"use client";

import React from 'react';
import { useState, useEffect, useCallback } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, Construction, Tag, Layers, CalendarDays, CheckCircle, User, Loader2, Users, FileText, Coins, Package, ShieldAlert, Trash2, AlertTriangle as AlertIconLI, UploadCloud, BookOpen, AlertCircle, Link as LinkIconLI, XCircle, Building, UserCog, ArrowUpFromLine, ArrowDownToLine, Timer, Check, PackageSearch } from "lucide-react"; // Added PackageSearch
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import type { Maquina, Customer, CompanyId, OwnerReferenceType, AuxiliaryEquipment } from "@/types";
import { MaquinaSchema, maquinaTypeOptions, maquinaOperationalStatusOptions, companyDisplayOptions, OWNER_REF_CUSTOMER, companyIds } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, setDoc, writeBatch } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";


const FIRESTORE_EQUIPMENT_COLLECTION_NAME = "equipamentos";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";
const FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME = "equipamentosAuxiliares";


const NO_CUSTOMER_SELECT_ITEM_VALUE = "_NO_CUSTOMER_SELECTED_";
const LOADING_CUSTOMERS_SELECT_ITEM_VALUE = "_LOADING_CUSTOMERS_";
const NO_OWNER_REFERENCE_VALUE = "_NOT_SPECIFIED_";


const operationalStatusIcons: Record<typeof maquinaOperationalStatusOptions[number], React.JSX.Element> = {
  Disponível: <CheckCircle className="h-4 w-4 text-green-500" />,
  Locada: <Package className="h-4 w-4 text-blue-500" />,
  'Em Manutenção': <ShieldAlert className="h-4 w-4 text-yellow-500" />,
  Sucata: <Trash2 className="h-4 w-4 text-red-500" />,
};

const parseNumericToNullOrNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
};

const predefinedBrandOptionsList = [
  "Toyota", "Hyster", "Yale", "Still", "Linde", "Clark", "Mitsubishi", "Nissan",
  "Komatsu", "Crown", "Raymond", "Doosan", "Hyundai", "Caterpillar",
  "Jungheinrich", "Hangcha", "Heli", "EP", "Outra"
];

const getFileNameFromUrl = (url: string): string => {
  try {
    const decodedUrl = decodeURIComponent(url);
    const pathAndQuery = decodedUrl.split('?')[0];
    const segments = pathAndQuery.split('/');
    const fileNameWithPossiblePrefix = segments.pop() || "arquivo";
    const fileNameCleaned = fileNameWithPossiblePrefix.split('?')[0];
    const finalFileName = fileNameCleaned.substring(fileNameCleaned.indexOf('_') + 1);
    return finalFileName || "arquivo";
  } catch (e) {
    console.error("Error parsing filename from URL:", e);
    return "arquivo";
  }
};

async function uploadFile(
  file: File,
  maquinaId: string,
  fileTypePrefix: 'partsCatalog' | 'errorCodes'
): Promise<string> {
  if (!storage) {
    throw new Error("Firebase Storage connection not available.");
  }
  const filePath = `equipment_files/${maquinaId}/${fileTypePrefix}_${file.name}`;
  const fileStorageRef = storageRef(storage!, filePath);
  await uploadBytes(fileStorageRef, file);
  return getDownloadURL(fileStorageRef);
}

async function deleteFileFromStorage(fileUrl?: string | null) {
  if (fileUrl) {
    if (!storage) {
      console.warn("deleteFileFromStorage: Firebase Storage connection not available. Skipping deletion.");
      return;
    }
    try {
      const gcsPath = new URL(fileUrl).pathname.split('/o/')[1].split('?')[0];
      const decodedPath = decodeURIComponent(gcsPath);
      const fileStorageRef = storageRef(storage!, decodedPath);
      await deleteObject(fileStorageRef);
    } catch (e) {
      console.warn(`[DELETE FILE] Failed to delete file from storage: ${fileUrl}`, e);
    }
  }
}


async function fetchMaquinas(): Promise<Maquina[]> {
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
      equipmentType: (maquinaTypeOptions.includes(data.equipmentType as any) || typeof data.equipmentType === 'string') ? data.equipmentType : "Empilhadeira Contrabalançada GLP",
      manufactureYear: parseNumericToNullOrNumber(data.manufactureYear),
      operationalStatus: maquinaOperationalStatusOptions.includes(data.operationalStatus as any) ? data.operationalStatus : "Disponível",
      customerId: data.customerId || null,
      ownerReference: data.ownerReference || null,
      towerOpenHeightMm: parseNumericToNullOrNumber(data.towerOpenHeightMm),
      towerClosedHeightMm: parseNumericToNullOrNumber(data.towerClosedHeightMm),
      nominalCapacityKg: parseNumericToNullOrNumber(data.nominalCapacityKg),
      batteryBoxWidthMm: parseNumericToNullOrNumber(data.batteryBoxWidthMm),
      batteryBoxHeightMm: parseNumericToNullOrNumber(data.batteryBoxHeightMm),
      batteryBoxDepthMm: parseNumericToNullOrNumber(data.batteryBoxDepthMm),
      monthlyRentalValue: parseNumericToNullOrNumber(data.monthlyRentalValue),
      hourMeter: parseNumericToNullOrNumber(data.hourMeter),
      notes: data.notes || null,
      partsCatalogUrl: data.partsCatalogUrl || null,
      errorCodesUrl: data.errorCodesUrl || null,
      linkedAuxiliaryEquipmentIds: Array.isArray(data.linkedAuxiliaryEquipmentIds) ? data.linkedAuxiliaryEquipmentIds : null,
    } as Maquina;
  });
}

async function fetchCustomers(): Promise<Customer[]> {
  if (!db) {
    throw new Error("Firebase Firestore connection not available.");
  }
  const q = query(collection(db!, FIRESTORE_CUSTOMER_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Customer));
}

async function fetchAllAuxiliaryEquipments(): Promise<AuxiliaryEquipment[]> {
    if (!db) {
        console.error("fetchAllAuxiliaryEquipments: Firebase DB is not available.");
        throw new Error("Firebase DB is not available");
    }
    const q = query(collection(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as AuxiliaryEquipment));
}


interface MaquinasClientPageProps {
  maquinaIdFromUrl?: string | null;
}

export function MaquinasClientPage({ maquinaIdFromUrl }: MaquinasClientPageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaquina, setEditingMaquina] = useState<Maquina | null>(null);
  const [partsCatalogFile, setPartsCatalogFile] = useState<File | null>(null);
  const [errorCodesFile, setErrorCodesFile] = useState<File | null>(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAuxiliaryEquipmentPopoverOpen, setIsAuxiliaryEquipmentPopoverOpen] = useState(false);


  const [showCustomFields, setShowCustomFields] = useState({
    brand: false,
    equipmentType: false,
  });

  const form = useForm<z.infer<typeof MaquinaSchema>>({
    resolver: zodResolver(MaquinaSchema),
    defaultValues: {
      brand: "", model: "", chassisNumber: "", equipmentType: "Empilhadeira Contrabalançada GLP",
      operationalStatus: "Disponível", customerId: null,
      ownerReference: null,
      manufactureYear: new Date().getFullYear(),
      customBrand: "", customEquipmentType: "",
      towerOpenHeightMm: undefined, towerClosedHeightMm: undefined,
      nominalCapacityKg: undefined,
      batteryBoxWidthMm: undefined, batteryBoxHeightMm: undefined, batteryBoxDepthMm: undefined,
      notes: "", monthlyRentalValue: undefined, hourMeter: undefined,
      partsCatalogUrl: null, errorCodesUrl: null,
      auxiliaryEquipmentIds: [],
    },
  });

  const { data: maquinaList = [], isLoading: isLoadingMaquinas, isError: isErrorMaquinas, error: errorMaquinas } = useQuery<Maquina[], Error>({
    queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME],
    queryFn: fetchMaquinas,
    enabled: !!db,
  });

  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[], Error>({
    queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME],
    queryFn: fetchCustomers,
    enabled: !!db,
  });

  const { data: allAuxiliaryEquipments = [], isLoading: isLoadingAuxiliaryEquipment } = useQuery<AuxiliaryEquipment[], Error>({
    queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME],
    queryFn: fetchAllAuxiliaryEquipments,
    enabled: !!db,
  });

  const openModal = useCallback((maquina?: Maquina) => {
    setPartsCatalogFile(null);
    setErrorCodesFile(null);
    if (maquina) {
      setEditingMaquina(maquina);
      setIsEditMode(false);
      const isBrandPredefined = predefinedBrandOptionsList.includes(maquina.brand) && maquina.brand !== "Outra";
      const isEquipmentTypePredefined = maquinaTypeOptions.includes(maquina.equipmentType as any);

      form.reset({
        ...maquina,
        model: maquina.model || "",
        brand: isBrandPredefined ? maquina.brand : '_CUSTOM_' as any,
        customBrand: isBrandPredefined ? "" : (maquina.brand === "Outra" || maquina.brand === "_CUSTOM_" ? "" : maquina.brand),
        equipmentType: isEquipmentTypePredefined ? maquina.equipmentType : '_CUSTOM_',
        customEquipmentType: isEquipmentTypePredefined ? "" : maquina.equipmentType,
        customerId: maquina.customerId || null,
        ownerReference: maquina.ownerReference || null,
        manufactureYear: maquina.manufactureYear ?? new Date().getFullYear(),
        towerOpenHeightMm: maquina.towerOpenHeightMm ?? undefined,
        towerClosedHeightMm: maquina.towerClosedHeightMm ?? undefined,
        nominalCapacityKg: maquina.nominalCapacityKg ?? undefined,
        batteryBoxWidthMm: maquina.batteryBoxWidthMm ?? undefined,
        batteryBoxHeightMm: maquina.batteryBoxHeightMm ?? undefined,
        batteryBoxDepthMm: maquina.batteryBoxDepthMm ?? undefined,
        monthlyRentalValue: maquina.monthlyRentalValue ?? undefined,
        hourMeter: maquina.hourMeter ?? undefined,
        notes: maquina.notes || null,
        partsCatalogUrl: maquina.partsCatalogUrl || null,
        errorCodesUrl: maquina.errorCodesUrl || null,
        auxiliaryEquipmentIds: maquina.linkedAuxiliaryEquipmentIds || [],
      });
      setShowCustomFields({ brand: !isBrandPredefined, equipmentType: !isEquipmentTypePredefined });
    } else {
      setEditingMaquina(null);
      setIsEditMode(true);
      form.reset({
        brand: "", model: "", chassisNumber: "", equipmentType: "Empilhadeira Contrabalançada GLP",
        operationalStatus: "Disponível", customerId: null,
        ownerReference: null,
        manufactureYear: new Date().getFullYear(),
        customBrand: "", customEquipmentType: "",
        towerOpenHeightMm: undefined, towerClosedHeightMm: undefined, nominalCapacityKg: undefined,
        batteryBoxWidthMm: undefined, batteryBoxHeightMm: undefined, batteryBoxDepthMm: undefined,
        notes: "", monthlyRentalValue: undefined, hourMeter: undefined,
        partsCatalogUrl: null, errorCodesUrl: null,
        auxiliaryEquipmentIds: [],
      });
      setShowCustomFields({ brand: false, equipmentType: false });
    }
    setIsModalOpen(true);
  }, [form]);


  useEffect(() => {
    if (maquinaIdFromUrl && !isLoadingMaquinas && maquinaList.length > 0 && !isModalOpen) {
      const maquinaToEdit = maquinaList.find(eq => eq.id === maquinaIdFromUrl);
      if (maquinaToEdit) {
        openModal(maquinaToEdit);
        if (typeof window !== "undefined") {
           window.history.replaceState(null, '', '/maquinas');
        }
      }
    }
  }, [maquinaIdFromUrl, maquinaList, isLoadingMaquinas, openModal, isModalOpen]);

  if (!db || !storage) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertIconLI className="h-16 w-16 text-destructive mb-4" />
        <PageHeader title="Erro de Conexão" />
        <p className="text-lg text-center text-muted-foreground">
          Não foi possível conectar aos serviços do Firebase.
          <br />
          Verifique a configuração e sua conexão com a internet.
        </p>
      </div>
    );
  }

  const prepareDataForFirestore = (
    formData: z.infer<typeof MaquinaSchema>,
    newPartsCatalogUrl?: string | null,
    newErrorCodesUrl?: string | null
  ): Omit<Maquina, 'id' | 'customBrand' | 'customEquipmentType'> => {
    const {
      customBrand,
      customEquipmentType,
      customerId: formCustomerId,
      ownerReference: formOwnerReferenceFromForm,
      auxiliaryEquipmentIds: formAuxiliaryEquipmentIds,
      ...restOfData
    } = formData;

    const parsedData = {
      ...restOfData,
      manufactureYear: parseNumericToNullOrNumber(restOfData.manufactureYear),
      towerOpenHeightMm: parseNumericToNullOrNumber(restOfData.towerOpenHeightMm),
      towerClosedHeightMm: parseNumericToNullOrNumber(restOfData.towerClosedHeightMm),
      nominalCapacityKg: parseNumericToNullOrNumber(restOfData.nominalCapacityKg),
      batteryBoxWidthMm: parseNumericToNullOrNumber(restOfData.batteryBoxWidthMm),
      batteryBoxHeightMm: parseNumericToNullOrNumber(restOfData.batteryBoxHeightMm),
      batteryBoxDepthMm: parseNumericToNullOrNumber(restOfData.batteryBoxDepthMm),
      monthlyRentalValue: parseNumericToNullOrNumber(restOfData.monthlyRentalValue),
      hourMeter: parseNumericToNullOrNumber(restOfData.hourMeter)
    };

    const finalOwnerReference: OwnerReferenceType | null = formOwnerReferenceFromForm ?? null;

    return {
      ...parsedData,
      brand: parsedData.brand === '_CUSTOM_' ? customBrand || "Não especificado" : parsedData.brand,
      model: parsedData.model,
      equipmentType: parsedData.equipmentType === '_CUSTOM_' ? customEquipmentType || "Não especificado" : parsedData.equipmentType,
      customerId: formCustomerId,
      ownerReference: finalOwnerReference,
      notes: parsedData.notes || null,
      partsCatalogUrl: newPartsCatalogUrl === undefined ? formData.partsCatalogUrl : newPartsCatalogUrl,
      errorCodesUrl: newErrorCodesUrl === undefined ? formData.errorCodesUrl : newErrorCodesUrl,
      linkedAuxiliaryEquipmentIds: formAuxiliaryEquipmentIds || null,
    };
  };

  const addMaquinaMutation = useMutation({
    mutationFn: async (data: {
      formData: z.infer<typeof MaquinaSchema>,
      catalogFile: File | null,
      codesFile: File | null
    }) => {
      if (!db || !storage) {
        throw new Error("Firebase Firestore ou Storage connection not available.");
      }
      setIsUploadingFiles(true);
      const newMaquinaId = doc(collection(db!, FIRESTORE_EQUIPMENT_COLLECTION_NAME)).id;
      let partsCatalogUrl: string | null = null;
      let errorCodesUrl: string | null = null;

      if (data.catalogFile) {
        partsCatalogUrl = await uploadFile(data.catalogFile, newMaquinaId, 'partsCatalog');
      }
      if (data.codesFile) {
        errorCodesUrl = await uploadFile(data.codesFile, newMaquinaId, 'errorCodes');
      }

      const maquinaDataForFirestore = prepareDataForFirestore(data.formData, partsCatalogUrl, errorCodesUrl);
      const batch = writeBatch(db!);

      batch.set(doc(db!, FIRESTORE_EQUIPMENT_COLLECTION_NAME, newMaquinaId), maquinaDataForFirestore);

      const auxIdsToLink = maquinaDataForFirestore.linkedAuxiliaryEquipmentIds || [];
      for (const auxId of auxIdsToLink) {
        const auxRef = doc(db!, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, auxId);
        batch.update(auxRef, { linkedEquipmentId: newMaquinaId });
      }
      await batch.commit();
      return { ...maquinaDataForFirestore, id: newMaquinaId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME] });
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      toast({ title: "Máquina Criada", description: `${data.brand} ${data.model} adicionada.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      let message = `Não foi possível criar ${variables.formData.brand} ${variables.formData.model}. Detalhe: ${err.message}`;
      if (err.message.includes("Um cliente deve ser selecionado")) {
        message = err.message;
      }
      toast({ title: "Erro ao Criar Máquina", description: message, variant: "destructive" });
    },
    onSettled: () => setIsUploadingFiles(false)
  });

  const updateMaquinaMutation = useMutation({
    mutationFn: async (data: {
      id: string,
      formData: z.infer<typeof MaquinaSchema>,
      catalogFile: File | null,
      codesFile: File | null,
      currentMaquina: Maquina
    }) => {
      if (!db || !storage) {
        throw new Error("Firebase Firestore ou Storage connection not available.");
      }
      setIsUploadingFiles(true);
      let newPartsCatalogUrl = data.currentMaquina.partsCatalogUrl;
      let newErrorCodesUrl = data.currentMaquina.errorCodesUrl;

      if (data.catalogFile) {
        await deleteFileFromStorage(data.currentMaquina.partsCatalogUrl);
        newPartsCatalogUrl = await uploadFile(data.catalogFile, data.id, 'partsCatalog');
      }
      if (data.codesFile) {
        await deleteFileFromStorage(data.currentMaquina.errorCodesUrl);
        newErrorCodesUrl = await uploadFile(data.codesFile, data.id, 'errorCodes');
      }

      const maquinaDataForFirestore = prepareDataForFirestore(data.formData, newPartsCatalogUrl, newErrorCodesUrl);
      const batch = writeBatch(db!);
      const maquinaRef = doc(db!, FIRESTORE_EQUIPMENT_COLLECTION_NAME, data.id);
      batch.update(maquinaRef, maquinaDataForFirestore as { [x: string]: any });

      const oldLinkedIds = data.currentMaquina.linkedAuxiliaryEquipmentIds || [];
      const newLinkedIds = maquinaDataForFirestore.linkedAuxiliaryEquipmentIds || [];

      const idsToUnlink = oldLinkedIds.filter(id => !newLinkedIds.includes(id));
      const idsToLink = newLinkedIds.filter(id => !oldLinkedIds.includes(id));

      for (const auxId of idsToUnlink) {
        const auxRef = doc(db!, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, auxId);
        batch.update(auxRef, { linkedEquipmentId: null });
      }
      for (const auxId of idsToLink) {
        const auxRef = doc(db!, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, auxId);
        batch.update(auxRef, { linkedEquipmentId: data.id });
      }
      await batch.commit();
      return { ...maquinaDataForFirestore, id: data.id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME] });
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      toast({ title: "Máquina Atualizada", description: `${data.brand} ${data.model} atualizada.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      let message = `Não foi possível atualizar ${variables.formData.brand} ${variables.formData.model}. Detalhe: ${err.message}`;
      if (err.message.includes("Um cliente deve ser selecionado")) {
        message = err.message;
      }
      toast({ title: "Erro ao Atualizar Máquina", description: message, variant: "destructive" });
    },
    onSettled: () => setIsUploadingFiles(false)
  });

  const removeFileMutation = useMutation({
    mutationFn: async (data: { maquinaId: string; fileType: 'partsCatalogUrl' | 'errorCodesUrl'; fileUrl: string }) => {
      if (!db || !storage) {
        throw new Error("Firebase Firestore ou Storage connection not available.");
      }
      await deleteFileFromStorage(data.fileUrl);
      const maquinaRef = doc(db!, FIRESTORE_EQUIPMENT_COLLECTION_NAME, data.maquinaId);
      await updateDoc(maquinaRef, { [data.fileType]: null });
      return { maquinaId: data.maquinaId, fileType: data.fileType };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME] });
      if(editingMaquina && editingMaquina.id === data.maquinaId){
        setEditingMaquina(prev => prev ? ({...prev, [data.fileType]: null}) : null);
        form.setValue(data.fileType, null);
      }
      toast({ title: "Arquivo Removido", description: "O arquivo foi removido com sucesso." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Remover Arquivo", description: err.message, variant: "destructive" });
    }
  });

  const deleteMaquinaMutation = useMutation({
    mutationFn: async (maquinaToDelete: Maquina) => {
      if (!db || !storage) {
        throw new Error("Firebase Firestore ou Storage connection not available.");
      }
      if (!maquinaToDelete?.id) {
        throw new Error("ID da máquina inválido fornecido para a função de mutação.");
      }
      const { id, partsCatalogUrl, errorCodesUrl, linkedAuxiliaryEquipmentIds } = maquinaToDelete;
      await deleteFileFromStorage(partsCatalogUrl);
      await deleteFileFromStorage(errorCodesUrl);

      const batch = writeBatch(db!);
      const maquinaRef = doc(db!, FIRESTORE_EQUIPMENT_COLLECTION_NAME, id);
      batch.delete(maquinaRef);

      if (linkedAuxiliaryEquipmentIds && linkedAuxiliaryEquipmentIds.length > 0) {
        for (const auxId of linkedAuxiliaryEquipmentIds) {
          const auxRef = doc(db!, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, auxId);
          batch.update(auxRef, { linkedEquipmentId: null });
        }
      }
      await batch.commit();
      return id;
    },
    onSuccess: (deletedMaquinaId) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME] });
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      toast({ title: "Máquina Excluída", description: "A máquina e seus arquivos foram removidos." });
      closeModal();
    },
    onError: (error: Error, maquinaToDelete) => {
      toast({
        title: "Erro ao Excluir Máquina",
        description: `Não foi possível excluir a máquina. Detalhe: ${error.message || 'Erro desconhecido.'}`,
        variant: "destructive"
      });
    },
  });


  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMaquina(null);
    setPartsCatalogFile(null);
    setErrorCodesFile(null);
    setIsEditMode(false);
    form.reset();
    setShowCustomFields({ brand: false, equipmentType: false });
  };

  const onSubmit = async (values: z.infer<typeof MaquinaSchema>) => {
    if (editingMaquina && editingMaquina.id) {
      updateMaquinaMutation.mutate({
        id: editingMaquina.id,
        formData: values,
        catalogFile: partsCatalogFile,
        codesFile: errorCodesFile,
        currentMaquina: editingMaquina
      });
    } else {
      addMaquinaMutation.mutate({ formData: values, catalogFile: partsCatalogFile, codesFile: errorCodesFile });
    }
  };

  const handleModalDeleteConfirm = () => {
    const maquinaToExclude = editingMaquina;
    if (!maquinaToExclude || !maquinaToExclude.id) {
      toast({ title: "Erro Interno", description: "Referência à máquina inválida para exclusão.", variant: "destructive" });
      return;
    }
    const confirmation = window.confirm(`Tem certeza que deseja excluir a máquina "${maquinaToExclude.brand} ${maquinaToExclude.model}" e seus arquivos associados? Esta ação não pode ser desfeita.`);
    if (confirmation) {
      deleteMaquinaMutation.mutate(maquinaToExclude);
    }
  };


  const handleFileRemove = (fileType: 'partsCatalogUrl' | 'errorCodesUrl') => {
    if (editingMaquina && editingMaquina.id) {
      const fileUrlToRemove = editingMaquina[fileType];
      if (fileUrlToRemove) {
        if (window.confirm(`Tem certeza que deseja remover este ${fileType === 'partsCatalogUrl' ? 'catálogo de peças' : 'arquivo de códigos de erro'}?`)) {
          removeFileMutation.mutate({ maquinaId: editingMaquina.id, fileType, fileUrl: fileUrlToRemove });
        }
      }
    }
  };


  const handleSelectChange = (field: 'brand' | 'equipmentType', value: string) => {
    form.setValue(field, value);
    setShowCustomFields(prev => ({ ...prev, [field]: value === '_CUSTOM_' }));
    if (value !== '_CUSTOM_') {
        form.setValue(field === 'brand' ? 'customBrand' : 'customEquipmentType', "");
    }
  };

  const getOwnerDisplayString = (ownerRef?: OwnerReferenceType | null, customerId?: string | null, customersList?: Customer[]): string => {
    if (ownerRef === OWNER_REF_CUSTOMER) {
      const customer = customersList?.find(c => c.id === customerId);
      return customer ? `${customer.name}` : 'Cliente (Não Vinculado)';
    }
    if (companyIds.includes(ownerRef as CompanyId)) {
      const company = companyDisplayOptions.find(c => c.id === ownerRef);
      return company ? `${company.name}` : 'Empresa Desconhecida';
    }
    return 'Não Especificado';
  };

  const getOwnerIcon = (ownerRef?: OwnerReferenceType | null): LucideIcon => {
    if (ownerRef === OWNER_REF_CUSTOMER) return UserCog;
    if (companyIds.includes(ownerRef as CompanyId)) return Building;
    return Construction;
  };

  const getLinkedAuxiliaryEquipmentDetails = (linkedIds?: string[] | null): { id: string, name: string }[] => {
    if (isLoadingAuxiliaryEquipment || !linkedIds || linkedIds.length === 0 || !allAuxiliaryEquipments) return [];
    return linkedIds.map(id => {
        const auxEq = allAuxiliaryEquipments.find(aux => aux.id === id);
        return auxEq ? { id: auxEq.id, name: auxEq.name } : null;
    }).filter(Boolean) as { id: string, name: string }[];
  };


  const isLoadingPage = isLoadingMaquinas || isLoadingCustomers || isLoadingAuxiliaryEquipment;
  const isMutating = addMaquinaMutation.isPending || updateMaquinaMutation.isPending || deleteMaquinaMutation.isPending || removeFileMutation.isPending || isUploadingFiles;

  if (isLoadingPage && !isModalOpen) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Carregando dados...</p>
      </div>
    );
  }

  if (isErrorMaquinas) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertIconLI className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Máquinas</h2>
        <p className="text-center">Não foi possível buscar os dados. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: {errorMaquinas?.message}</p>
      </div>
    );
  }

  const handleAuxiliaryEquipmentSelect = (equipmentId: string) => {
    const currentSelected = form.getValues("auxiliaryEquipmentIds") || [];
    const newSelected = currentSelected.includes(equipmentId)
      ? currentSelected.filter(id => id !== equipmentId)
      : [...currentSelected, equipmentId];
    form.setValue("auxiliaryEquipmentIds", newSelected, { shouldDirty: true, shouldValidate: true });
  };


  return (
    <>
      <PageHeader title="Máquinas"
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Máquina
          </Button>
        }
      />

      {maquinaList.length === 0 && !isLoadingMaquinas ? (
        <DataTablePlaceholder
          icon={Construction}
          title="Nenhuma Máquina Registrada"
          description="Adicione sua primeira máquina para começar a rastrear."
          buttonLabel="Adicionar Máquina"
          onButtonClick={() => openModal()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {maquinaList.map((maq) => {
            const customer = maq.customerId ? customers.find(c => c.id === maq.customerId) : null;
            const ownerDisplay = getOwnerDisplayString(maq.ownerReference, maq.customerId, customers);
            const OwnerIconComponent = getOwnerIcon(maq.ownerReference);
            const linkedAuxDetails = getLinkedAuxiliaryEquipmentDetails(maq.linkedAuxiliaryEquipmentIds);
            return (
            <Card
              key={maq.id}
              className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer"
              onClick={() => openModal(maq)}
            >
              <CardHeader>
                <CardTitle className="font-headline text-xl text-primary">{maq.brand} {maq.model}</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow space-y-2 text-sm">
                 <p className="flex items-center text-sm">
                    <Tag className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Chassi:</span>
                    <span>{maq.chassisNumber}</span>
                  </p>
                <p className="flex items-center text-sm"><Layers className="mr-2 h-4 w-4 text-primary" /> <span className="font-medium text-muted-foreground mr-1">Tipo:</span> {maq.equipmentType}</p>
                {maq.manufactureYear && <p className="flex items-center text-sm"><CalendarDays className="mr-2 h-4 w-4 text-primary" /> <span className="font-medium text-muted-foreground mr-1">Ano:</span> {maq.manufactureYear}</p>}
                <p className="flex items-center text-sm">
                    <OwnerIconComponent className="mr-2 h-4 w-4 text-primary" /> <span className="font-medium text-muted-foreground mr-1">Propriedade:</span> {ownerDisplay}
                </p>
                <p className="flex items-center text-sm">
                  {operationalStatusIcons[maq.operationalStatus]}
                  <span className="font-medium text-muted-foreground mr-1 ml-2">Status:</span>
                  <span className={cn({
                    'text-green-600': maq.operationalStatus === 'Disponível',
                    'text-blue-500': maq.operationalStatus === 'Locada',
                    'text-yellow-600': maq.operationalStatus === 'Em Manutenção',
                    'text-red-600': maq.operationalStatus === 'Sucata',
                  })}>
                    {maq.operationalStatus}
                  </span>
                </p>
                {customer ? (
                  <p className="flex items-center text-sm">
                    <Users className="mr-2 h-4 w-4 text-primary" /> <span className="font-medium text-muted-foreground mr-1">Cliente:</span>
                    <Link
                      href={`/customers?openCustomerId=${maq.customerId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-1 text-primary hover:underline truncate"
                      title={`Ver detalhes de ${customer.name}`}
                    >
                      {customer.name}
                    </Link>
                  </p>
                ) : maq.customerId ? (
                     <p className="flex items-center text-sm"><Users className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="font-medium text-muted-foreground mr-1">Cliente:</span> ID {maq.customerId} (Carregando...)</p>
                ): null}

                {maq.towerOpenHeightMm !== null && maq.towerOpenHeightMm !== undefined && (
                  <p className="flex items-center text-sm"><ArrowUpFromLine className="mr-2 h-4 w-4 text-primary" /> <span className="font-medium text-muted-foreground mr-1">H3 - Torre Aberta:</span> {maq.towerOpenHeightMm} mm</p>
                )}
                {maq.towerClosedHeightMm !== null && maq.towerClosedHeightMm !== undefined && (
                  <p className="flex items-center text-sm"><ArrowDownToLine className="mr-2 h-4 w-4 text-primary" /> <span className="font-medium text-muted-foreground mr-1">H1 - Torre Fechada:</span> {maq.towerClosedHeightMm} mm</p>
                )}
                 {maq.hourMeter !== null && maq.hourMeter !== undefined && <p className="flex items-center text-sm"><Timer className="mr-2 h-4 w-4 text-primary" /> <span className="font-medium text-muted-foreground mr-1">Horímetro:</span> {maq.hourMeter}h</p>}
                 {maq.monthlyRentalValue !== null && maq.monthlyRentalValue !== undefined && <p className="flex items-center text-sm"><Coins className="mr-2 h-4 w-4 text-primary" /> <span className="font-medium text-muted-foreground mr-1">Aluguel Mensal:</span> R$ {maq.monthlyRentalValue.toFixed(2)}</p>}

                  <div className="pt-1">
                    {isLoadingAuxiliaryEquipment ? (
                      <p className="flex items-center text-xs text-muted-foreground">
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Carregando equip. auxiliares...
                      </p>
                    ) : linkedAuxDetails.length > 0 ? (
                      <div>
                        <h4 className="font-semibold text-xs mt-1 mb-0.5 flex items-center">
                          <PackageSearch className="mr-1.5 h-3.5 w-3.5 text-primary" />
                          <span className="font-medium text-muted-foreground mr-1">Equip. Aux.:</span>
                        </h4>
                        <ul className="list-none pl-1 space-y-0.5">
                          {linkedAuxDetails.slice(0, 3).map(aux => (
                            <li key={aux.id} className="text-xs text-muted-foreground">
                              <Link
                                href={`/auxiliary-equipment?openAuxEquipmentId=${aux.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:underline hover:text-primary transition-colors"
                                title={`Ver detalhes de ${aux.name}`}
                              >
                                {aux.name}
                              </Link>
                            </li>
                          ))}
                          {linkedAuxDetails.length > 3 && (
                            <li className="text-xs text-muted-foreground">...e mais {linkedAuxDetails.length - 3}.</li>
                          )}
                        </ul>
                      </div>
                    ) : (
                      <p className="flex items-center text-xs text-muted-foreground mt-1">
                        <PackageSearch className="mr-1.5 h-3.5 w-3.5 text-gray-400" />
                        <span className="font-medium text-muted-foreground mr-1">Equip. Aux.:</span>
                        Nenhum vinculado.
                      </p>
                    )}
                  </div>


                 {maq.partsCatalogUrl && (
                    <p className="flex items-center text-sm">
                        <BookOpen className="mr-2 h-4 w-4 text-primary" />
                        <span className="font-medium text-muted-foreground mr-1">Catálogo Peças:</span>
                        <a
                          href={maq.partsCatalogUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-primary hover:underline hover:text-primary/80 transition-colors truncate"
                          title={`Ver Catálogo de Peças: ${getFileNameFromUrl(maq.partsCatalogUrl)}`}
                        >
                            {getFileNameFromUrl(maq.partsCatalogUrl)}
                        </a>
                    </p>
                 )}
                 {maq.errorCodesUrl && (
                    <p className="flex items-center text-sm">
                        <AlertCircle className="mr-2 h-4 w-4 text-primary" />
                        <span className="font-medium text-muted-foreground mr-1">Códigos Erro:</span>
                        <a
                          href={maq.errorCodesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-primary hover:underline hover:text-primary/80 transition-colors truncate"
                          title={`Ver Códigos de Erro: ${getFileNameFromUrl(maq.errorCodesUrl)}`}
                        >
                            {getFileNameFromUrl(maq.errorCodesUrl)}
                        </a>
                    </p>
                 )}
                 {maq.notes && (
                  <p className="flex items-start text-sm">
                    <FileText className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Obs.:</span>
                    <span className="whitespace-pre-wrap break-words">{maq.notes}</span>
                  </p>
                 )}
              </CardContent>
              <CardFooter className="border-t pt-4 flex justify-end gap-2">
              </CardFooter>
            </Card>
          );
        })}
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingMaquina ? "Editar Máquina" : "Adicionar Nova Máquina"}
        description="Forneça os detalhes da máquina, incluindo arquivos PDF se necessário."
        formId="maquina-form"
        isSubmitting={isMutating}
        editingItem={editingMaquina}
        onDeleteConfirm={handleModalDeleteConfirm}
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
        isDeleting={deleteMaquinaMutation.isPending}
        deleteButtonLabel="Excluir Máquina"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="maquina-form" className="space-y-4">
            <fieldset disabled={!!editingMaquina && !isEditMode} className="space-y-4">
                <h3 className="text-md font-semibold pt-2 border-b pb-1 font-headline">Informações Básicas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="brand" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Marca</FormLabel>
                        <Select onValueChange={(value) => handleSelectChange('brand', value)} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione ou digite" /></SelectTrigger></FormControl>
                        <SelectContent>
                            {predefinedBrandOptionsList.map(option => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                            <SelectItem value="_CUSTOM_">Digitar Marca...</SelectItem>
                        </SelectContent>
                        </Select>
                        {showCustomFields.brand && (
                        <FormField control={form.control} name="customBrand" render={({ field: customField }) => (
                            <FormItem className="mt-2">
                            <FormControl><Input placeholder="Digite a marca" {...customField} value={customField.value ?? ""} /></FormControl>
                            <FormMessage />
                            </FormItem>
                        )} />
                        )}
                        <FormMessage />
                    </FormItem>
                    )} />

                    <FormField control={form.control} name="model" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Modelo</FormLabel>
                        <FormControl><Input placeholder="Ex: 8FGCU25, S25" {...field} value={field.value ?? ""} /></FormControl>
                        <FormMessage />
                    </FormItem>
                    )} />
                </div>

              <FormField control={form.control} name="chassisNumber" render={({ field }) => (
                <FormItem><FormLabel>Número do Chassi</FormLabel><FormControl><Input placeholder="Número único do chassi" {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormField
                control={form.control}
                name="ownerReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Propriedade</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === NO_OWNER_REFERENCE_VALUE ? null : value as OwnerReferenceType)}
                      value={field.value || NO_OWNER_REFERENCE_VALUE}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o proprietário" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_OWNER_REFERENCE_VALUE}>Não Especificado / Outro</SelectItem>
                        {companyDisplayOptions.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={OWNER_REF_CUSTOMER}>Cliente Vinculado</SelectItem>
                      </SelectContent>
                    </Select>
                    {field.value === OWNER_REF_CUSTOMER && !form.getValues("customerId") && (
                       <FormDescription className="text-destructive">Atenção: Vincule um cliente abaixo para esta opção.</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField control={form.control} name="customerId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente Associado (Serviço/Locação)</FormLabel>
                    <Select
                      onValueChange={(selectedValue) => field.onChange(selectedValue === NO_CUSTOMER_SELECT_ITEM_VALUE ? null : selectedValue)}
                      value={field.value || NO_CUSTOMER_SELECT_ITEM_VALUE}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingCustomers ? "Carregando clientes..." : "Selecione um cliente"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingCustomers ? (
                          <SelectItem value={LOADING_CUSTOMERS_SELECT_ITEM_VALUE} disabled>Carregando...</SelectItem>
                        ) : (
                          <>
                            <SelectItem value={NO_CUSTOMER_SELECT_ITEM_VALUE}>Nenhum</SelectItem>
                            {customers.map((cust) => (
                              <SelectItem key={cust.id} value={cust.id}>
                                {cust.name} ({cust.cnpj})
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />


              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="equipmentType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Máquina</FormLabel>
                  <Select onValueChange={(value) => handleSelectChange('equipmentType', value)} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {maquinaTypeOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      <SelectItem value="_CUSTOM_">Digitar Tipo...</SelectItem>
                    </SelectContent>
                  </Select>
                  {showCustomFields.equipmentType && (
                    <FormField control={form.control} name="customEquipmentType" render={({ field: customField }) => (
                     <FormItem className="mt-2">
                        <FormControl><Input placeholder="Digite o tipo" {...customField} value={customField.value ?? ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="manufactureYear" render={({ field }) => (
                <FormItem><FormLabel>Ano de Fabricação</FormLabel><FormControl><Input type="number" placeholder="Ex: 2022" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value,10))} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="operationalStatus" render={({ field }) => (
             <FormItem><FormLabel>Status Operacional</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {maquinaOperationalStatusOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select><FormMessage />
              </FormItem>
            )} />

            <h3 className="text-md font-semibold pt-4 border-b pb-1 font-headline">Equipamentos Auxiliares Vinculados</h3>
            <FormField
              control={form.control}
              name="auxiliaryEquipmentIds"
              render={({ field }) => (
                <FormItem>
                  <Popover open={isAuxiliaryEquipmentPopoverOpen} onOpenChange={setIsAuxiliaryEquipmentPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={isAuxiliaryEquipmentPopoverOpen}
                          className="w-full justify-between font-normal"
                        >
                          {field.value && field.value.length > 0
                            ? `${field.value.length} selecionado(s)`
                            : "Selecionar equipamentos..."}
                           <Layers className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      {isLoadingAuxiliaryEquipment ? (
                        <div className="flex justify-center items-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
                        </div>
                      ) : allAuxiliaryEquipments.length === 0 ? (
                        <div className="p-4 text-sm text-center text-muted-foreground">
                            Nenhum equipamento auxiliar cadastrado.
                        </div>
                       ) : (
                        <Command>
                          <CommandInput placeholder="Buscar equipamento auxiliar..." />
                          <CommandList className="max-h-[200px]">
                            <CommandEmpty>Nenhum equipamento encontrado.</CommandEmpty>
                            <CommandGroup>
                              {allAuxiliaryEquipments?.map((equipment) => (
                                <CommandItem
                                  key={equipment.id}
                                  value={equipment.name}
                                  onSelect={() => {
                                    handleAuxiliaryEquipmentSelect(equipment.id);
                                  }}
                                >
                                  <Checkbox
                                    checked={field.value?.includes(equipment.id)}
                                    onCheckedChange={() => handleAuxiliaryEquipmentSelect(equipment.id)}
                                    className="mr-2"
                                    aria-labelledby={`aux-label-${equipment.id}`}
                                  />
                                  <Label htmlFor={`aux-label-${equipment.id}`} className="flex-grow cursor-pointer">
                                    {equipment.name} ({equipment.type})
                                  </Label>
                                  {field.value?.includes(equipment.id) && (
                                    <Check className="ml-auto h-4 w-4 text-primary" />
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      )}
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                   {field.value && field.value.length > 0 && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      <strong>Selecionados:</strong> {field.value.map(id => allAuxiliaryEquipments?.find(eq => eq.id === id)?.name).filter(Boolean).join(", ")}
                    </div>
                  )}
                </FormItem>
              )}
            />


              <h3 className="text-md font-semibold pt-4 border-b pb-1 font-headline">Especificações Técnicas (Opcional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField control={form.control} name="towerOpenHeightMm" render={({ field }) => (
                <FormItem><FormLabel>H3 - Torre Aberta (mm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="towerClosedHeightMm" render={({ field }) => (
                <FormItem><FormLabel>H1 - Torre Fechada (mm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="nominalCapacityKg" render={({ field }) => (
                <FormItem><FormLabel>Capacidade Nominal (kg)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <h3 className="text-md font-semibold pt-4 border-b pb-1 font-headline">Dimensões Caixa de Bateria (Opcional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="batteryBoxWidthMm" render={({ field }) => (
                    <FormItem><FormLabel>Largura (mm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="batteryBoxHeightMm" render={({ field }) => (
                    <FormItem><FormLabel>Altura (mm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="batteryBoxDepthMm" render={({ field }) => (
                    <FormItem><FormLabel>Comprimento (mm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))} /></FormControl><FormMessage /></FormItem>
                )} />
            </div>

            <h3 className="text-md font-semibold pt-4 border-b pb-1 font-headline">Arquivos (PDF)</h3>
            <FormItem>
              <FormLabel>Catálogo de Peças (PDF)</FormLabel>
              {editingMaquina?.partsCatalogUrl && !partsCatalogFile && (
                <div className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                  <a href={editingMaquina.partsCatalogUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                    <LinkIconLI className="h-3 w-3"/> Ver Catálogo: {getFileNameFromUrl(editingMaquina.partsCatalogUrl)}
                  </a>
                  <Button type="button" variant="ghost" size="sm" onClick={() => handleFileRemove('partsCatalogUrl')} className="text-destructive hover:text-destructive">
                    <XCircle className="h-4 w-4 mr-1"/> Remover
                  </Button>
                </div>
              )}
              <FormControl>
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPartsCatalogFile(e.target.files ? e.target.files[0] : null)}
                  className="mt-1"
                />
              </FormControl>
              {partsCatalogFile && <FormDescription>Novo arquivo selecionado: {partsCatalogFile.name}</FormDescription>}
              <FormMessage />
            </FormItem>

            <FormItem>
              <FormLabel>Códigos de Erro (PDF)</FormLabel>
               {editingMaquina?.errorCodesUrl && !errorCodesFile && (
                <div className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                  <a href={editingMaquina.errorCodesUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                    <LinkIconLI className="h-3 w-3"/> Ver Códigos: {getFileNameFromUrl(editingMaquina.errorCodesUrl)}
                  </a>
                   <Button type="button" variant="ghost" size="sm" onClick={() => handleFileRemove('errorCodesUrl')} className="text-destructive hover:text-destructive">
                    <XCircle className="h-4 w-4 mr-1"/> Remover
                  </Button>
                </div>
              )}
              <FormControl>
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setErrorCodesFile(e.target.files ? e.target.files[0] : null)}
                  className="mt-1"
                />
              </FormControl>
              {errorCodesFile && <FormDescription>Novo arquivo selecionado: {errorCodesFile.name}</FormDescription>}
              <FormMessage />
            </FormItem>


            <h3 className="text-md font-semibold pt-4 border-b pb-1 font-headline">Informações Adicionais (Opcional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField control={form.control} name="hourMeter" render={({ field }) => (
                    <FormItem><FormLabel>Horímetro Atual (h)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="monthlyRentalValue" render={({ field }) => (
                   <FormItem><FormLabel>Valor Aluguel Mensal (R$)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))} /></FormControl><FormMessage /></FormItem>
                )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea placeholder="Detalhes adicionais, histórico, etc." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
            </fieldset>
          </form>
        </Form>
      </FormModal>
    </>
  );
}
