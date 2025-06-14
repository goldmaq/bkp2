
"use client";

import { useState, useEffect, useMemo } from "react"; // Added useMemo
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, Users, FileText, MapPin, Mail, Building, HardHat, Loader2, AlertTriangle, Search, Phone, User, Construction, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { Customer, Technician, Maquina } from "@/types";
import { CustomerSchema } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "../ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import { toTitleCase, getWhatsAppNumber, formatPhoneNumberForInputDisplay, formatAddressForDisplay, generateGoogleMapsUrl } from "@/lib/utils"; // Import centralized utils

const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";
const FIRESTORE_EQUIPMENT_COLLECTION_NAME = "equipamentos";

const NO_TECHNICIAN_SELECT_ITEM_VALUE = "_NO_TECHNICIAN_SELECTED_";
const LOADING_TECHNICIANS_SELECT_ITEM_VALUE = "_LOADING_TECHS_";

async function fetchCustomers(): Promise<Customer[]> {
  if (!db) {
    console.error("fetchCustomers: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db!, FIRESTORE_CUSTOMER_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
}

async function fetchTechnicians(): Promise<Technician[]> {
  if (!db) {
    console.error("fetchTechnicians: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db!, FIRESTORE_TECHNICIAN_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Technician));
}

async function fetchMaquinas(): Promise<Maquina[]> {
  if (!db) {
    console.error("fetchMaquinas: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db!, FIRESTORE_EQUIPMENT_COLLECTION_NAME), orderBy("brand", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      fleetNumber: data.fleetNumber || null, // Ensure fleetNumber is handled
    } as Maquina;
  });
}

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

interface BrasilApiResponseCnpj {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  ddd_telefone_1?: string;
  email?: string | null;
  descricao_situacao_cadastral?: string;
  erro?: boolean;
  message?: string;
}


export function CustomerClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [isCnpjLoading, setIsCnpjLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const form = useForm<z.infer<typeof CustomerSchema>>({
    resolver: zodResolver(CustomerSchema),
    defaultValues: {
      name: "",
      fantasyName: "",
      cnpj: "",
      email: "",
      phone: "",
      contactName: "",
      cep: null,
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      preferredTechnician: null,
      notes: "",
    },
  });

  const { data: customers = [], isLoading: isLoadingCustomers, isError: isErrorCustomers, error: errorCustomers } = useQuery<Customer[], Error>({
    queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME],
    queryFn: fetchCustomers,
    enabled: !!db,
  });

  const { data: technicians = [], isLoading: isLoadingTechnicians } = useQuery<Technician[], Error>({
    queryKey: [FIRESTORE_TECHNICIAN_COLLECTION_NAME],
    queryFn: fetchTechnicians,
    enabled: !!db,
  });

  const techniciansOnly = useMemo(() => {
    if (!technicians) return [];
    return technicians.filter(tech => tech.role === 'Técnico');
  }, [technicians]);

  const { data: maquinaList = [], isLoading: isLoadingMaquinas, isError: isErrorMaquinas, error: errorMaquinas } = useQuery<Maquina[], Error>({
    queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME],
    queryFn: fetchMaquinas,
    enabled: !!db,
  });

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return customers;
    }
    const lowercasedSearchTerm = searchTerm.toLowerCase();
    return customers.filter((customer) =>
      customer.name.toLowerCase().includes(lowercasedSearchTerm) ||
      (customer.fantasyName && customer.fantasyName.toLowerCase().includes(lowercasedSearchTerm)) ||
      customer.cnpj.toLowerCase().includes(lowercasedSearchTerm) ||
      (customer.contactName && customer.contactName.toLowerCase().includes(lowercasedSearchTerm)) ||
      (customer.email && customer.email.toLowerCase().includes(lowercasedSearchTerm))
    );
  }, [customers, searchTerm]);


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

  const checkCnpjExists = async (cnpj: string, currentCustomerId?: string): Promise<boolean> => {
    if (!db) return false;
    const cleanedCnpj = cnpj.replace(/\D/g, "");
    const q = query(collection(db, FIRESTORE_CUSTOMER_COLLECTION_NAME), where("cnpj", "==", cleanedCnpj));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return false;
    }
    // If updating, check if the found CNPJ belongs to a different customer
    if (currentCustomerId) {
      return querySnapshot.docs.some(doc => doc.id !== currentCustomerId);
    }
    return true; // Found for a new customer
  };

  const addCustomerMutation = useMutation({
    mutationFn: async (newCustomerData: z.infer<typeof CustomerSchema>) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      const cnpjExists = await checkCnpjExists(newCustomerData.cnpj);
      if (cnpjExists) {
        throw new Error(`Já existe um cliente cadastrado com o CNPJ: ${newCustomerData.cnpj}`);
      }
      const dataToSave = {
        ...newCustomerData,
        cnpj: newCustomerData.cnpj.replace(/\D/g, ""), // Save cleaned CNPJ
      };
      const docRef = await addDoc(collection(db!, FIRESTORE_CUSTOMER_COLLECTION_NAME), dataToSave);
      return docRef;
    },
    onSuccess: (docRef, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME] });
      toast({ title: "Cliente Criado", description: `${variables.name} foi adicionado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Criar", description: err.message || `Não foi possível criar o cliente ${variables.name}.`, variant: "destructive" });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (customerData: Customer) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      const { id, ...dataToUpdate } = customerData;
      if (!id) throw new Error("ID do cliente é necessário para atualização.");

      const originalCustomer = customers.find(c => c.id === id);
      if (originalCustomer && dataToUpdate.cnpj !== originalCustomer.cnpj) {
        const cnpjExists = await checkCnpjExists(dataToUpdate.cnpj, id);
        if (cnpjExists) {
          throw new Error(`O CNPJ ${dataToUpdate.cnpj} já está em uso por outro cliente.`);
        }
      }
      const dataToSave = {
        ...dataToUpdate,
        cnpj: dataToUpdate.cnpj.replace(/\D/g, ""), // Save cleaned CNPJ
      };
      const customerRef = doc(db!, FIRESTORE_CUSTOMER_COLLECTION_NAME, id);
      await updateDoc(customerRef, dataToSave);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME] });
      toast({ title: "Cliente Atualizado", description: `${variables.name} foi atualizado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar", description: err.message || `Não foi possível atualizar o cliente ${variables.name}.`, variant: "destructive" });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      if (!customerId) throw new Error("ID do cliente é necessário para exclusão.");
      await deleteDoc(doc(db!, FIRESTORE_CUSTOMER_COLLECTION_NAME, customerId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME] });
      toast({ title: "Cliente Excluído", description: `O cliente foi excluído.` });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Excluir", description: `Não foi possível excluir o cliente. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const handleSearchCep = async () => {
    const cepValue = form.getValues("cep");
    if (!cepValue) {
        toast({ title: "CEP Vazio", description: "Por favor, insira um CEP.", variant: "default" });
        return;
    }
    const cleanedCep = cepValue.replace(/\D/g, "");
    if (cleanedCep.length !== 8) {
      toast({ title: "CEP Inválido", description: "CEP deve conter 8 dígitos.", variant: "destructive" });
      return;
    }

    setIsCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanedCep}/json/`);
      const data: ViaCepResponse = await response.json();
      if (data.erro) {
        toast({ title: "CEP Não Encontrado", description: "O CEP informado não foi encontrado.", variant: "destructive" });
        form.setValue("street", "");
        form.setValue("neighborhood", "");
        form.setValue("city", "");
        form.setValue("state", "");
        form.setValue("complement", "");
      } else {
        form.setValue("street", data.logradouro || "");
        form.setValue("neighborhood", data.bairro || "");
        form.setValue("city", data.localidade || "");
        form.setValue("state", data.uf || "");
        form.setValue("complement", data.complemento || "");
        toast({ title: "Endereço Encontrado", description: "Os campos de endereço foram preenchidos." });
      }
    } catch (error) {
      toast({ title: "Erro ao Buscar CEP", description: "Não foi possível buscar o endereço. Verifique sua conexão.", variant: "destructive" });
    } finally {
      setIsCepLoading(false);
    }
  };

  const handleSearchCnpj = async () => {
    const cnpjValue = form.getValues("cnpj");
    if (!cnpjValue) {
      toast({ title: "CNPJ Vazio", description: "Por favor, insira um CNPJ.", variant: "default" });
      return;
    }
    const cleanedCnpj = cnpjValue.replace(/\D/g, "");
    if (cleanedCnpj.length !== 14) {
      toast({ title: "CNPJ Inválido", description: "CNPJ deve conter 14 dígitos.", variant: "destructive" });
      return;
    }

    setIsCnpjLoading(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanedCnpj}`);
      const data: BrasilApiResponseCnpj = await response.json();

      if (!response.ok || data.erro || data.message) {
        const errorMessage = data.message || "CNPJ não encontrado ou dados inválidos.";
        toast({ title: "Erro na Consulta de CNPJ", description: errorMessage, variant: "destructive" });
        form.setValue("name", form.getValues("name") || "");
      } else {
        form.setValue("name", data.razao_social || "");
        form.setValue("fantasyName", data.nome_fantasia || "");
        form.setValue("street", data.logradouro || "");
        form.setValue("number", data.numero || "");
        form.setValue("complement", data.complemento || "");
        form.setValue("neighborhood", data.bairro || "");
        form.setValue("city", data.municipio || "");
        form.setValue("state", data.uf || "");
        form.setValue("cep", data.cep ? data.cep.replace(/\D/g, '') : "");
        form.setValue("email", data.email ?? "");

        let primaryPhone = data.ddd_telefone_1 || "";
        if (!primaryPhone && (data as any).ddd_telefone_2) {
          primaryPhone = (data as any).ddd_telefone_2;
        }
        form.setValue("phone", primaryPhone ? formatPhoneNumberForInputDisplay(primaryPhone) : "");

        toast({ title: "CNPJ Encontrado", description: "Os dados do cliente foram preenchidos." });
      }
    } catch (error) {
      toast({ title: "Erro ao Buscar CNPJ", description: "Não foi possível buscar os dados do CNPJ. Verifique sua conexão.", variant: "destructive" });
    } finally {
      setIsCnpjLoading(false);
    }
  };


  const openModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      form.reset({
        ...customer,
        cnpj: customer.cnpj, // Use the raw CNPJ for the form
        fantasyName: customer.fantasyName || "",
        email: customer.email || "",
        phone: customer.phone ? formatPhoneNumberForInputDisplay(customer.phone) : "",
        preferredTechnician: customer.preferredTechnician || null,
        cep: customer.cep || null,
      });
      setIsEditMode(false);
    } else {
      setEditingCustomer(null);
      form.reset({
        name: "", fantasyName: "", cnpj: "", email: "", phone: "", contactName: "",
        cep: null, street: "", number: "",
        complement: "", neighborhood: "", city: "", state: "",
        preferredTechnician: null, notes: ""
      });
      setIsEditMode(true);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    form.reset();
    setIsEditMode(false);
  };

  const onSubmit = async (values: z.infer<typeof CustomerSchema>) => {
    const dataToSave = {
        ...values,
        cnpj: values.cnpj.replace(/\D/g, ""), // Ensure CNPJ is clean for saving
        preferredTechnician: values.preferredTechnician || null,
        email: values.email || null,
    };
    if (editingCustomer && editingCustomer.id) {
      updateCustomerMutation.mutate({ ...dataToSave, id: editingCustomer.id });
    } else {
      addCustomerMutation.mutate(dataToSave);
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingCustomer && editingCustomer.id) {
       if (window.confirm(`Tem certeza que deseja excluir o cliente "${editingCustomer.name}"?`)) {
        deleteCustomerMutation.mutate(editingCustomer.id);
      }
    }
  };

  const isMutating = addCustomerMutation.isPending || updateCustomerMutation.isPending;
  const isLoadingPageData = isLoadingCustomers || isLoadingTechnicians || isLoadingMaquinas;

  if (isLoadingPageData && !isModalOpen) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Carregando dados...</p>
      </div>
    );
  }

  if (isErrorCustomers) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Clientes</h2>
        <p className="text-center">Não foi possível buscar os dados dos clientes. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: {errorCustomers?.message}</p>
      </div>
    );
  }

  if (isErrorMaquinas) {
     return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Máquinas</h2>
        <p className="text-center">Não foi possível buscar os dados das máquinas. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: {errorMaquinas?.message}</p>
      </div>
    );
  }


  return (
    <>
      <PageHeader
        title=""
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating || deleteCustomerMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Cliente
          </Button>
        }
      />
      <p className="text-muted-foreground text-sm mb-6 -mt-4">
        Centralize o cadastro e gerencie suas informações de contato. Adicione, edite e visualize informações e máquinas vinculadas.
      </p>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, nome fantasia, CNPJ, contato ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10"
          />
        </div>
      </div>

      {customers.length === 0 && !isLoadingCustomers && !searchTerm.trim() ? (
        <DataTablePlaceholder
          icon={Users}
          title="Nenhum Cliente Ainda"
          description="Comece adicionando seu primeiro cliente."
          buttonLabel="Adicionar Cliente"
          onButtonClick={() => openModal()}
        />
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-10">
          <Search className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-lg font-semibold">Nenhum Cliente Encontrado</h3>
          <p className="text-sm text-muted-foreground">
            Sua busca não retornou resultados. Tente um termo diferente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map((customer) => {
            const linkedMaquinas = maquinaList.filter(eq => eq.customerId === customer.id);
            const whatsappNumber = getWhatsAppNumber(customer.phone);
            const whatsappLink = whatsappNumber
              ? `https://wa.me/${whatsappNumber}?text=Ol%C3%A1%20${encodeURIComponent(customer.name)}`
              : "#";
            const displayAddress = formatAddressForDisplay(customer);
            const googleMapsUrl = generateGoogleMapsUrl(customer);
            const preferredTechnicianDetails = technicians.find(t => t.name === customer.preferredTechnician);

            return (
            <Card
              key={customer.id}
              className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer"
              onClick={() => openModal(customer)}
            >
              <CardHeader>
                <CardTitle className="font-headline text-xl text-primary">{toTitleCase(customer.name)}</CardTitle>
                {customer.fantasyName && (
                  <CardDescription className="text-sm text-muted-foreground">
                    {toTitleCase(customer.fantasyName)}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-grow space-y-2 text-sm">
                <p className="flex items-center text-sm">
                  <ShieldQuestion className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-muted-foreground mr-1">CNPJ:</span>
                  <span>{customer.cnpj}</span>
                </p>
                {customer.contactName && !customer.phone && (
                  <p className="flex items-center text-sm">
                    <User className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-medium text-muted-foreground mr-1">Contato:</span>
                    <span>{toTitleCase(customer.contactName)}</span>
                  </p>
                )}
                {customer.email && (
                  <p className="flex items-center text-sm">
                    <Mail className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-medium text-muted-foreground mr-1">Email:</span>
                    <a
                      href={`mailto:${customer.email}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-primary truncate"
                      onClick={(e) => e.stopPropagation()}
                      title={customer.email}
                    >
                      {customer.email}
                    </a>
                  </p>
                )}
                {customer.phone && (
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
                      {formatPhoneNumberForInputDisplay(customer.phone)}
                    </a>
                    {customer.contactName && <span className="ml-1 text-muted-foreground/80 text-xs">(Contato: {toTitleCase(customer.contactName)})</span>}
                  </p>
                )}
                <div className="flex items-start text-sm">
                  <MapPin className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                  <div>
                    <span className="font-medium text-muted-foreground mr-1">Endereço:</span>
                    {googleMapsUrl !== "#" ? (
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-primary"
                        onClick={(e) => e.stopPropagation()}
                        title="Abrir no Google Maps"
                      >
                        {displayAddress}
                      </a>
                    ) : (
                      <span>{displayAddress}</span>
                    )}
                  </div>
                </div>

                {preferredTechnicianDetails &&
                  <p className="flex items-center text-sm">
                    <HardHat className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-medium text-muted-foreground mr-1">Téc. Pref.:</span>
                    <span>{toTitleCase(preferredTechnicianDetails.name)}</span>
                  </p>
                }
                {customer.notes && (
                  <p className="flex items-start text-sm">
                    <FileText className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Obs.:</span>
                    <span className="whitespace-pre-wrap break-words">{customer.notes}</span>
                  </p>
                )}

                <div className="pt-2 mt-2 border-t border-border">
                  {isLoadingMaquinas ? (
                     <p className="flex items-center text-xs text-muted-foreground mt-2">
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Carregando máquinas...
                     </p>
                  ) : linkedMaquinas.length > 0 ? (
                    <div>
                      <h4 className="font-semibold text-xs mt-2 mb-1 flex items-center">
                        <Construction className="mr-1.5 h-3.5 w-3.5 text-primary" />
                        <span className="font-medium text-muted-foreground mr-1">Máquinas Vinculadas:</span>
                      </h4>
                      <ScrollArea className="max-h-32 pr-2">
                        <ul className="list-none pl-1 space-y-0.5">
                          {linkedMaquinas.map(maq => (
                            <li key={maq.id} className="text-xs text-muted-foreground">
                              <Link
                                href={`/maquinas?openMaquinaId=${maq.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:underline hover:text-primary transition-colors"
                                title={`Ver detalhes de ${maq.brand} ${maq.model}`}
                              >
                                {maq.brand} {maq.model}
                                <span className="text-gray-400">
                                  (Chassi: {maq.chassisNumber}{maq.fleetNumber ? `, Frota: ${maq.fleetNumber}` : ''})
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </div>
                  ) : (
                    <p className="flex items-center text-xs text-muted-foreground mt-2">
                      <Construction className="mr-1.5 h-3.5 w-3.5 text-gray-400" />
                      <span className="font-medium text-muted-foreground mr-1">Máquinas:</span>
                       Nenhuma vinculada.
                    </p>
                  )}
                </div>
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
        title={editingCustomer ? "Editar Cliente" : "Adicionar Novo Cliente"}
        description="Preencha os detalhes do cliente."
        formId="customer-form"
        isSubmitting={isMutating}
        editingItem={editingCustomer}
        onDeleteConfirm={editingCustomer ? handleModalDeleteConfirm : undefined}
        isDeleting={deleteCustomerMutation.isPending}
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
        deleteButtonLabel="Excluir Cliente"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="customer-form" className="space-y-4">
            <fieldset disabled={!!editingCustomer && !isEditMode} className="space-y-4">
              <FormField control={form.control} name="cnpj" render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input placeholder="00.000.000/0000-00" {...field} onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        let formattedCnpj = value;
                        if (value.length > 2) formattedCnpj = `${value.slice(0,2)}.${value.slice(2)}`;
                        if (value.length > 5) formattedCnpj = `${formattedCnpj.slice(0,6)}.${value.slice(5)}`;
                        if (value.length > 8) formattedCnpj = `${formattedCnpj.slice(0,10)}/${value.slice(8)}`;
                        if (value.length > 12) formattedCnpj = `${formattedCnpj.slice(0,15)}-${value.slice(12)}`;
                        field.onChange(formattedCnpj.substring(0, 18));
                      }}/>
                    </FormControl>
                    <Button type="button" variant="outline" onClick={handleSearchCnpj} disabled={isCnpjLoading || (!!editingCustomer && !isEditMode)}>
                      {isCnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span className="ml-2 sm:inline hidden">Buscar</span>
                    </Button>
                  </div>
                   <FormDescription>Digite o CNPJ para buscar dados automaticamente.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Nome (Razão Social)</FormLabel><FormControl><Input placeholder="Nome completo do cliente ou razão social" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="fantasyName" render={({ field }) => (
                <FormItem><FormLabel>Nome Fantasia (Opcional)</FormLabel><FormControl><Input placeholder="Nome fantasia, se houver" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="contactName" render={({ field }) => (
                <FormItem><FormLabel>Nome do Contato (Opcional)</FormLabel><FormControl><Input placeholder="Nome da pessoa de contato" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
               <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email Principal (Opcional)</FormLabel><FormControl><Input type="email" placeholder="contato@exemplo.com" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone Principal (Opcional)</FormLabel>
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

              <h3 className="text-md font-semibold pt-2 border-b pb-1 font-headline">Endereço</h3>

              <FormField control={form.control} name="cep" render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input placeholder="00000-000" {...field} value={field.value ?? ""} onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        if (value.length <= 5) {
                          field.onChange(value);
                        } else if (value.length <= 8) {
                          field.onChange(`${value.slice(0,5)}-${value.slice(5)}`);
                        } else {
                          field.onChange(`${value.slice(0,5)}-${value.slice(5,8)}`);
                        }
                      }}/>
                    </FormControl>
                    <Button type="button" variant="outline" onClick={handleSearchCep} disabled={isCepLoading || (!!editingCustomer && !isEditMode)}>
                      {isCepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span className="ml-2 sm:inline hidden">Buscar</span>
                    </Button>
                  </div>
                  <FormDescription>Digite o CEP para buscar o endereço automaticamente.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="street" render={({ field }) => (
                <FormItem><FormLabel>Rua / Logradouro</FormLabel><FormControl><Input placeholder="Ex: Av. Paulista" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="number" render={({ field }) => (
                  <FormItem className="md:col-span-1"><FormLabel>Número</FormLabel><FormControl><Input placeholder="Ex: 123" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="complement" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Complemento</FormLabel><FormControl><Input placeholder="Ex: Apto 10, Bloco B" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <FormField control={form.control} name="neighborhood" render={({ field }) => (
                <FormItem><FormLabel>Bairro</FormLabel><FormControl><Input placeholder="Ex: Bela Vista" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Cidade</FormLabel><FormControl><Input placeholder="Ex: São Paulo" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="state" render={({ field }) => (
                  <FormItem className="md:col-span-1"><FormLabel>Estado (UF)</FormLabel><FormControl><Input placeholder="Ex: SP" maxLength={2} {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <h3 className="text-md font-semibold pt-2 border-b pb-1 font-headline">Outras Informações</h3>
              <FormField
                control={form.control}
                name="preferredTechnician"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Técnico Preferencial (Opcional)</FormLabel>
                    <Select
                      onValueChange={(selectedValue) => {
                          field.onChange(selectedValue === NO_TECHNICIAN_SELECT_ITEM_VALUE ? null : selectedValue);
                      }}
                      value={field.value ?? NO_TECHNICIAN_SELECT_ITEM_VALUE}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingTechnicians ? "Carregando técnicos..." : "Selecione um técnico"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isLoadingTechnicians ? (
                          <SelectItem value={LOADING_TECHNICIANS_SELECT_ITEM_VALUE} disabled>Carregando...</SelectItem>
                        ) : (
                          <>
                            <SelectItem value={NO_TECHNICIAN_SELECT_ITEM_VALUE}>Nenhum</SelectItem>
                            {techniciansOnly.map((tech) => (
                              <SelectItem key={tech.id} value={tech.name}>
                                {tech.name}
                              </SelectItem>
                            ))}
                             {techniciansOnly.length === 0 && !isLoadingTechnicians && (
                                <SelectItem value="no_techs_available" disabled>Nenhum técnico disponível</SelectItem>
                            )}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações (Opcional)</FormLabel><FormControl><Textarea placeholder="Quaisquer observações relevantes sobre o cliente" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>
          </form>
        </Form>
      </FormModal>
    </>
  );
}

