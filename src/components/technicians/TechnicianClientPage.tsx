
"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, HardHat, UserCircle, Wrench, Loader2, AlertTriangle, Phone, Briefcase, UploadCloud, XCircle, Image as ImageIconLucide } from "lucide-react";
import Image from "next/image"; // For Next.js optimized images
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import type { Technician } from "@/types";
import { TechnicianSchema, roleOptionsList } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase"; // Import storage
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"; // Storage functions
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWhatsAppNumber, formatPhoneNumberForInputDisplay } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // For preview

const FIRESTORE_COLLECTION_NAME = "tecnicos";

async function fetchTechnicians(): Promise<Technician[]> {
  if (!db) {
    console.error("fetchTechnicians: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db!, FIRESTORE_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Technician));
}

async function uploadProfileImage(file: File, technicianId: string): Promise<string> {
  if (!storage) {
    throw new Error("Firebase Storage connection not available.");
  }
  const filePath = `technician_images/${technicianId}/profile_pic_${Date.now()}`;
  const fileStorageRef = storageRef(storage, filePath);
  await uploadBytes(fileStorageRef, file);
  return getDownloadURL(fileStorageRef);
}

async function deleteProfileImage(imageUrl?: string | null) {
  if (!imageUrl) return;
  if (!storage) {
    console.warn("deleteProfileImage: Firebase Storage connection not available. Skipping deletion.");
    return;
  }
  try {
    const imageRef = storageRef(storage, imageUrl);
    await deleteObject(imageRef);
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      console.warn("Image not found in storage, skipping deletion:", imageUrl);
    } else {
      console.error("Error deleting profile image from storage:", error);
      // Potentially re-throw or toast if crucial
    }
  }
}


export function TechnicianClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);


  const form = useForm<z.infer<typeof TechnicianSchema>>({
    resolver: zodResolver(TechnicianSchema),
    defaultValues: { name: "", role: "", specialization: "", phone: "", imageUrl: null },
  });

  const { data: technicians = [], isLoading, isError, error } = useQuery<Technician[], Error>({
    queryKey: [FIRESTORE_COLLECTION_NAME],
    queryFn: fetchTechnicians,
    enabled: !!db,
  });

  if (!db) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <PageHeader title="Erro de Conexão com Firebase" />
        <p className="text-lg text-center text-muted-foreground">
          Não foi possível conectar ao banco de dados.
          <br />
          Verifique a configuração do Firebase e sua conexão com a internet.
        </p>
      </div>
    );
  }

  const addTechnicianMutation = useMutation({
    mutationFn: async (data: { technicianData: z.infer<typeof TechnicianSchema>; imageFile: File | null }) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para adicionar colaborador.");
      let imageUrl: string | null = null;
      const newTechnicianId = doc(collection(db!, FIRESTORE_COLLECTION_NAME)).id; // Generate ID beforehand

      if (data.imageFile) {
        setIsUploadingImage(true);
        try {
          imageUrl = await uploadProfileImage(data.imageFile, newTechnicianId);
        } catch (uploadError: any) {
          setIsUploadingImage(false);
          toast({ title: "Erro no Upload da Imagem", description: uploadError.message, variant: "destructive" });
          throw uploadError; // Prevent form submission
        }
        setIsUploadingImage(false);
      }
      const dataToSave = { ...data.technicianData, imageUrl };
      await addDoc(collection(db!, FIRESTORE_COLLECTION_NAME), dataToSave); // Use addDoc with pre-generated ID if needed, or let Firestore generate
      return { ...dataToSave, id: newTechnicianId }; // Return with ID
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Colaborador Adicionado", description: `${data.name} foi adicionado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Adicionar", description: `Não foi possível adicionar o colaborador ${variables.technicianData.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const updateTechnicianMutation = useMutation({
    mutationFn: async (data: {
      technicianData: Technician;
      imageFile: File | null;
      removeCurrentImage: boolean;
    }) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para atualizar colaborador.");
      const { id, ...currentData } = data.technicianData;
      if (!id) throw new Error("ID do colaborador é necessário para atualização.");

      let finalImageUrl = currentData.imageUrl || null;
      const originalImageUrl = editingTechnician?.imageUrl;

      setIsUploadingImage(true);
      try {
        if (data.imageFile) { // New image uploaded
          if (originalImageUrl) {
            await deleteProfileImage(originalImageUrl);
          }
          finalImageUrl = await uploadProfileImage(data.imageFile, id);
        } else if (data.removeCurrentImage && originalImageUrl) { // Image explicitly removed
          await deleteProfileImage(originalImageUrl);
          finalImageUrl = null;
        }
      } catch (uploadError: any) {
        setIsUploadingImage(false);
        toast({ title: "Erro no Processamento da Imagem", description: uploadError.message, variant: "destructive" });
        throw uploadError;
      }
      setIsUploadingImage(false);

      const dataToUpdate = { ...currentData, ...form.getValues(), imageUrl: finalImageUrl };
      const techRef = doc(db!, FIRESTORE_COLLECTION_NAME, id);
      await updateDoc(techRef, dataToUpdate);
      return { ...dataToUpdate, id };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Colaborador Atualizado", description: `${variables.technicianData.name} foi atualizado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar", description: `Não foi possível atualizar o colaborador ${variables.technicianData.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });


  const deleteTechnicianMutation = useMutation({
    mutationFn: async (technician: Technician) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para excluir colaborador.");
      if (!technician.id) throw new Error("ID do colaborador é necessário para exclusão.");
      if (technician.imageUrl) {
        await deleteProfileImage(technician.imageUrl);
      }
      return deleteDoc(doc(db!, FIRESTORE_COLLECTION_NAME, technician.id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Colaborador Excluído", description: `O colaborador foi removido.` });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Excluir", description: `Não foi possível excluir o colaborador. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });


  const openModal = (technician?: Technician) => {
    setProfileImageFile(null); // Reset file on modal open
    if (technician) {
      setEditingTechnician(technician);
      form.reset({
        ...technician,
        phone: technician.phone ? formatPhoneNumberForInputDisplay(technician.phone) : "",
        imageUrl: technician.imageUrl || null,
      });
      setImagePreview(technician.imageUrl || null);
      setIsEditMode(false);
    } else {
      setEditingTechnician(null);
      form.reset({ name: "", role: "", specialization: "", phone: "", imageUrl: null });
      setImagePreview(null);
      setIsEditMode(true);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTechnician(null);
    form.reset();
    setIsEditMode(false);
    setProfileImageFile(null);
    setImagePreview(null);
  };

  const onSubmit = async (values: z.infer<typeof TechnicianSchema>) => {
    const dataToSubmit = {
      ...values,
      phone: values.phone ? values.phone.replace(/\D/g, '') : undefined,
    };

    if (editingTechnician && editingTechnician.id) {
      const removeCurrentImage = imagePreview === null && !!editingTechnician.imageUrl && !profileImageFile;
      updateTechnicianMutation.mutate({
        technicianData: { ...dataToSubmit, id: editingTechnician.id, imageUrl: imagePreview }, // Pass current/new image URL
        imageFile: profileImageFile,
        removeCurrentImage,
      });
    } else {
      addTechnicianMutation.mutate({ technicianData: dataToSubmit, imageFile: profileImageFile });
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingTechnician && editingTechnician.id) {
      if (window.confirm(`Tem certeza que deseja excluir o colaborador "${editingTechnician.name}"? Esta ação também removerá a foto de perfil.`)) {
        deleteTechnicianMutation.mutate(editingTechnician);
      }
    }
  };

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setProfileImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      form.setValue('imageUrl', 'file_selected', { shouldValidate: true, shouldDirty: true }); // Dummy value to trigger change
    } else {
      // If no file is selected, revert to existing image if editing, or null if new
      setProfileImageFile(null);
      setImagePreview(editingTechnician?.imageUrl || null);
      form.setValue('imageUrl', editingTechnician?.imageUrl || null, { shouldValidate: true, shouldDirty: true });
    }
  };

  const handleRemoveImage = () => {
    setProfileImageFile(null);
    setImagePreview(null);
    form.setValue('imageUrl', null, { shouldValidate: true, shouldDirty: true }); // Mark for removal
  };

  const isMutating = addTechnicianMutation.isPending || updateTechnicianMutation.isPending || isUploadingImage;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Carregando colaboradores...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Colaboradores</h2>
        <p className="text-center">Não foi possível buscar os dados. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: {error?.message}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title=""
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating || deleteTechnicianMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Colaborador
          </Button>
        }
      />
      <p className="text-muted-foreground text-sm mb-6 -mt-4">
        Cadastro e gerenciamento dos dados dos técnicos e outros colaboradores da empresa. Permite registrar nome, cargo, especialização (para técnicos) e informações de contato.
      </p>

      {technicians.length === 0 && !isLoading ? (
        <DataTablePlaceholder
          icon={HardHat}
          title="Nenhum Colaborador Cadastrado"
          description="Adicione seu primeiro colaborador ao cadastro."
          buttonLabel="Adicionar Colaborador"
          onButtonClick={() => openModal()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {technicians.map((tech) => {
            const whatsappNumber = getWhatsAppNumber(tech.phone);
            const whatsappLink = whatsappNumber
              ? `https://wa.me/${whatsappNumber}?text=Ol%C3%A1%20${encodeURIComponent(tech.name)}`
              : "#";
            return (
              <Card
                key={tech.id}
                className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer"
                onClick={() => openModal(tech)}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={tech.imageUrl || undefined} alt={tech.name} data-ai-hint="person portrait" />
                      <AvatarFallback>
                        {tech.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="font-headline text-xl text-primary">{tech.name}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-2 text-sm">
                  <p className="flex items-center text-sm">
                    <Briefcase className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Cargo:</span>
                    <span>{tech.role}</span>
                  </p>
                  {tech.specialization && (
                    <p className="flex items-center text-sm">
                      <Wrench className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">Especialização:</span>
                      <span>{tech.specialization}</span>
                    </p>
                  )}
                  {tech.phone && (
                    <p className="flex items-center text-sm">
                      <Phone className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">{whatsappNumber ? "WhatsApp:" : "Telefone:"}</span>
                      <a
                         href={whatsappLink}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="hover:underline text-primary"
                         onClick={(e) => e.stopPropagation()}
                         title={whatsappNumber ? "Abrir no WhatsApp" : "Número de telefone"}
                      >
                        {formatPhoneNumberForInputDisplay(tech.phone)}
                      </a>
                    </p>
                  )}
                </CardContent>
                <CardFooter className="border-t pt-4 flex justify-end gap-2">
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingTechnician ? "Editar Colaborador" : "Adicionar Novo Colaborador"}
        description="Insira os detalhes do colaborador."
        formId="technician-form"
        isSubmitting={isMutating}
        editingItem={editingTechnician}
        onDeleteConfirm={handleModalDeleteConfirm}
        isDeleting={deleteTechnicianMutation.isPending}
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
        deleteButtonLabel="Excluir Colaborador"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="technician-form" className="space-y-4">
            <fieldset disabled={!!editingTechnician && !isEditMode} className="space-y-4">
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem className="flex flex-col items-center">
                    <FormLabel htmlFor="profile-image-upload" className="cursor-pointer">
                      <Avatar className="w-24 h-24 mb-2 ring-2 ring-offset-2 ring-primary/50 hover:ring-primary transition-all">
                        <AvatarImage src={imagePreview || undefined} alt="Foto do Colaborador" data-ai-hint="person portrait"/>
                        <AvatarFallback>
                          <ImageIconLucide className="w-10 h-10 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                    </FormLabel>
                    <Input
                      id="profile-image-upload"
                      type="file"
                      accept="image/jpeg, image/png, image/webp"
                      onChange={handleImageFileChange}
                      className="hidden"
                      disabled={!!editingTechnician && !isEditMode}
                    />
                    {isEditMode && (
                      <div className="flex gap-2 mt-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('profile-image-upload')?.click()} disabled={isUploadingImage}>
                          <UploadCloud className="mr-2 h-4 w-4" />
                          {imagePreview ? "Trocar Foto" : "Selecionar Foto"}
                        </Button>
                        {imagePreview && (
                          <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage} className="text-destructive hover:text-destructive-foreground hover:bg-destructive" disabled={isUploadingImage}>
                            <XCircle className="mr-2 h-4 w-4" />
                            Remover Foto
                          </Button>
                        )}
                      </div>
                    )}
                    <FormDescription className="text-xs text-center">JPG, PNG ou WEBP. Máx 2MB.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Nome</FormLabel><FormControl><Input placeholder="Nome completo do colaborador" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cargo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cargo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roleOptionsList.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="specialization" render={({ field }) => (
                <FormItem><FormLabel>Especialização (Opcional)</FormLabel><FormControl><Input placeholder="ex: Hidráulica, Elétrica (para técnicos)" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone/WhatsApp (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="(00) 00000-0000"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                         field.onChange(formatPhoneNumberForInputDisplay(e.target.value));
                      }}
                      maxLength={15}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </fieldset>
          </form>
        </Form>
      </FormModal>
    </>
  );
}

