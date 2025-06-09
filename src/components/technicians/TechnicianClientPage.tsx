
"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, HardHat, UserCircle, Wrench, Loader2, AlertTriangle, Phone, Briefcase } from "lucide-react"; // Added Briefcase
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { Technician } from "@/types";
import { TechnicianSchema, roleOptionsList } from "@/types"; // Added roleOptionsList
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWhatsAppNumber, formatPhoneNumberForInputDisplay } from "@/lib/utils"; // Import centralized utils

const FIRESTORE_COLLECTION_NAME = "tecnicos"; // This collection name can remain "tecnicos"

async function fetchTechnicians(): Promise<Technician[]> { // Function name can remain fetchTechnicians
  if (!db) {
    console.error("fetchTechnicians: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db!, FIRESTORE_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Technician));
}

export function TechnicianClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(null); // Variable name can remain editingTechnician
  const [isEditMode, setIsEditMode] = useState(false);

  const form = useForm<z.infer<typeof TechnicianSchema>>({
    resolver: zodResolver(TechnicianSchema),
    defaultValues: { name: "", role: "", specialization: "", phone: "" }, // Added role, removed employeeId
  });

  const { data: technicians = [], isLoading, isError, error } = useQuery<Technician[], Error>({ // Variable name can remain technicians
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
    mutationFn: async (newTechnicianData: z.infer<typeof TechnicianSchema>) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para adicionar colaborador.");
      return addDoc(collection(db!, FIRESTORE_COLLECTION_NAME), newTechnicianData);
    },
    onSuccess: (docRef, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Colaborador Adicionado", description: `${variables.name} foi adicionado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Adicionar", description: `Não foi possível adicionar o colaborador ${variables.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const updateTechnicianMutation = useMutation({
    mutationFn: async (technicianData: Technician) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para atualizar colaborador.");
      const { id, ...dataToUpdate } = technicianData;
      if (!id) throw new Error("ID do colaborador é necessário para atualização.");
      const techRef = doc(db!, FIRESTORE_COLLECTION_NAME, id);
      return updateDoc(techRef, dataToUpdate);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Colaborador Atualizado", description: `${variables.name} foi atualizado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar", description: `Não foi possível atualizar o colaborador ${variables.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const deleteTechnicianMutation = useMutation({
    mutationFn: async (technicianId: string) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para excluir colaborador.");
      if (!technicianId) throw new Error("ID do colaborador é necessário para exclusão.");
      return deleteDoc(doc(db!, FIRESTORE_COLLECTION_NAME, technicianId));
    },
    onSuccess: (_, technicianId) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Colaborador Excluído", description: `O colaborador foi removido.` });
      closeModal(); 
    },
    onError: (err: Error, technicianId) => {
      toast({ title: "Erro ao Excluir", description: `Não foi possível excluir o colaborador. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const openModal = (technician?: Technician) => {
    if (technician) {
      setEditingTechnician(technician);
      form.reset({
        ...technician,
        phone: technician.phone ? formatPhoneNumberForInputDisplay(technician.phone) : "",
      });
      setIsEditMode(false); 
    } else {
      setEditingTechnician(null);
      form.reset({ name: "", role: "", specialization: "", phone: "" }); // Updated defaultValues
      setIsEditMode(true); 
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTechnician(null);
    form.reset();
    setIsEditMode(false);
  };
  

  const onSubmit = async (values: z.infer<typeof TechnicianSchema>) => {
    const dataToSave = {
      ...values,
      phone: values.phone ? values.phone.replace(/\D/g, '') : undefined, 
    };
    if (editingTechnician && editingTechnician.id) {
      updateTechnicianMutation.mutate({ ...dataToSave, id: editingTechnician.id });
    } else {
      addTechnicianMutation.mutate(dataToSave);
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingTechnician && editingTechnician.id) {
      if (window.confirm(`Tem certeza que deseja excluir o colaborador "${editingTechnician.name}"?`)) {
        deleteTechnicianMutation.mutate(editingTechnician.id);
      }
    }
  };
  
  const isMutating = addTechnicianMutation.isPending || updateTechnicianMutation.isPending;

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
                    <UserCircle className="w-10 h-10 text-primary flex-shrink-0" />
                    <div>
                      <CardTitle className="font-headline text-xl text-primary">{tech.name}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-2 text-sm">
                  <p className="flex items-center text-sm">
                    <Briefcase className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> {/* Icon for Role */}
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
