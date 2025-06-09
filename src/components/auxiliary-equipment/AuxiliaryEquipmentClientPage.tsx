
"use client";

import { useState, useMemo, useEffect, useCallback } from "react"; // Added useEffect, useCallback
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, PackageSearch, Edit, Trash2, Tag, CheckCircle, Construction, Link as LinkIconLI, FileText, Package, ShieldAlert, Loader2, AlertTriangle, Box, BatteryCharging, Anchor, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { AuxiliaryEquipment, Maquina } from "@/types";
import { AuxiliaryEquipmentSchema, auxiliaryEquipmentTypeOptions, auxiliaryEquipmentStatusOptions } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase"; // Added storage
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME = "equipamentosAuxiliares";
const FIRESTORE_MAQUINAS_COLLECTION_NAME = "equipamentos";

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

async function fetchAuxiliaryEquipment(): Promise<AuxiliaryEquipment[]> {
  if (!db) {
    console.error("fetchAuxiliaryEquipment: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as AuxiliaryEquipment));
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

  const form = useForm<z.infer<typeof AuxiliaryEquipmentSchema>>({
    resolver: zodResolver(AuxiliaryEquipmentSchema),
    defaultValues: {
      name: "",
      type: "",
      customType: "",
      serialNumber: "",
      status: "Disponível",
      notes: "",
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
    if (item) {
      setEditingItem(item);
      const isTypePredefined = auxiliaryEquipmentTypeOptions.includes(item.type as any);
      form.reset({
        name: item.name,
        type: isTypePredefined ? item.type : CUSTOM_AUXILIARY_TYPE_VALUE,
        customType: isTypePredefined ? "" : item.type,
        serialNumber: item.serialNumber || "",
        status: item.status,
        notes: item.notes || "",
      });
      setShowCustomTypeField(!isTypePredefined);
      setIsEditMode(false);
    } else {
      setEditingItem(null);
      form.reset({
        name: "", type: "", customType: "", serialNumber: "",
        status: "Disponível", notes: "",
      });
      setShowCustomTypeField(false);
      setIsEditMode(true);
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


  if (!db || !storage) { // Check for storage as well if page might interact with it
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <PageHeader title="Erro de Conexão com Firebase" />
        <p className="text-lg text-center text-muted-foreground">
          Não foi possível conectar ao banco de dados ou ao serviço de armazenamento.
          <br />
          Verifique a configuração do Firebase e sua conexão com a internet.
        </p>
      </div>
    );
  }

  const addAuxEquipmentMutation = useMutation({
    mutationFn: async (newItemData: z.infer<typeof AuxiliaryEquipmentSchema>) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para adicionar equipamento auxiliar.");
      const { customType, ...dataToSave } = newItemData;
      const finalData = {
        ...dataToSave,
        type: dataToSave.type === CUSTOM_AUXILIARY_TYPE_VALUE ? customType || "Outro" : dataToSave.type,
        serialNumber: dataToSave.serialNumber || null,
        notes: dataToSave.notes || null,
      };
      return addDoc(collection(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME), finalData);
    },
    onSuccess: (docRef, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      toast({ title: "Equipamento Auxiliar Adicionado", description: `${variables.name} foi adicionado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Adicionar", description: `Não foi possível adicionar ${variables.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const updateAuxEquipmentMutation = useMutation({
    mutationFn: async (itemData: AuxiliaryEquipment) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para atualizar equipamento auxiliar.");
      const formData = form.getValues();
      const { id, linkedEquipmentId: currentLinkedEquipmentId } = itemData; // Keep currentLinkedEquipmentId from DB data

      if (!id) throw new Error("ID do item é necessário para atualização.");

      const finalData = {
        name: formData.name,
        type: formData.type === CUSTOM_AUXILIARY_TYPE_VALUE ? formData.customType || "Outro" : formData.type,
        serialNumber: formData.serialNumber || null,
        status: formData.status,
        notes: formData.notes || null,
        linkedEquipmentId: currentLinkedEquipmentId, // Preserve existing linkedEquipmentId, it's managed by Maquinas form
      };

      const itemRef = doc(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, id);
      return updateDoc(itemRef, finalData);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      toast({ title: "Equipamento Auxiliar Atualizado", description: `${variables.name} foi atualizado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar", description: `Não foi possível atualizar ${variables.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const deleteAuxEquipmentMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para excluir equipamento auxiliar.");
      if (!itemId) throw new Error("ID do item é necessário para exclusão.");
      return deleteDoc(doc(db, FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME, itemId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_AUX_EQUIPMENT_COLLECTION_NAME] });
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_MAQUINAS_COLLECTION_NAME]});
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
  };

  const onSubmit = async (values: z.infer<typeof AuxiliaryEquipmentSchema>) => {
    if (editingItem && editingItem.id) {
      // Pass the original editingItem which includes linkedEquipmentId
      updateAuxEquipmentMutation.mutate({ ...values, id: editingItem.id, linkedEquipmentId: editingItem.linkedEquipmentId } as AuxiliaryEquipment);
    } else {
      addAuxEquipmentMutation.mutate(values);
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingItem && editingItem.id) {
      if (window.confirm(`Tem certeza que deseja excluir o equipamento auxiliar "${editingItem.name}"? Esta ação também o desvinculará de qualquer máquina.`)) {
        deleteAuxEquipmentMutation.mutate(editingItem.id);
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

  const isLoadingPageData = isLoadingAux || isLoadingMaquinasPrincipais;
  const isMutating = addAuxEquipmentMutation.isPending || updateAuxEquipmentMutation.isPending || deleteAuxEquipmentMutation.isPending;

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
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating}>
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
            return (
            <Card
              key={item.id}
              className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer"
              onClick={() => openModal(item)}
            >
              <CardHeader>
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
        description="Forneça os detalhes do equipamento auxiliar."
        formId="aux-equipment-form"
        isSubmitting={isMutating}
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
