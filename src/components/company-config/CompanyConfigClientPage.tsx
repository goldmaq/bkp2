
"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type * as z from "zod";
import { Building, Landmark, Hash, QrCode, MapPin, Contact, Loader2, AlertTriangle, Search, ShieldQuestion, Phone, Mail } from "lucide-react"; // Added Phone, Mail

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import type { Company, CompanyId } from "@/types";
import { CompanySchema, companyIds } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatAddressForDisplay, formatPhoneNumberForInputDisplay } from "@/lib/utils"; // Import the utility function

const FIRESTORE_COLLECTION_NAME = "empresas";


const initialCompanyDataFromCode: Record<CompanyId, Omit<Company, 'id'>> = {
  goldmaq: { 
    name: "Gold Maq", 
    cnpj: "04.325.000/0001-12", 
    street: "RUA ARISTIDES MARIOTTI", 
    number: "290", 
    neighborhood: "RECANTO QUARTO CENTENARIO", 
    city: "Jundiai", 
    state: "SP", 
    cep: "13211-740",
    phone: "11999998888",
    email: "contato@goldmaq.com.br",
    bankName: "Banco Alpha", 
    bankAgency: "0001", 
    bankAccount: "12345-6", 
    bankPixKey: "cnpj@goldmaq.com.br" 
  },
  goldcomercio: { 
    name: "Gold Comércio", 
    cnpj: "33.521.128/0001-50", 
    street: "RUA ARISTIDES MARIOTTI", 
    number: "290", 
    neighborhood: "RECANTO QUARTO CENTENARIO", 
    city: "Jundiai", 
    state: "SP", 
    cep: "13211-740",
    phone: "11777776666",
    email: "comercial@goldcomercio.com.br",
    bankName: "Banco Beta", 
    bankAgency: "0002", 
    bankAccount: "65432-1" 
  },
  goldjob: { 
    name: "Gold Empilhadeiras", 
    cnpj: "13.311.149/0001-33", 
    street: "RUA ARISTIDES MARIOTTI", 
    number: "290", 
    neighborhood: "RECANTO QUARTO CENTENARIO", 
    city: "Jundiai", 
    state: "SP", 
    cep: "13211-740",
    phone: "11555554444",
    email: "orcamento@goldempilhadeiras.com.br"
  },
};

interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

async function fetchCompanyConfigs(): Promise<Company[]> {
  if (!db) {
    console.error("fetchCompanyConfigs: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const fetchedCompanies: Company[] = [];
  for (const id of companyIds) {
    const docRef = doc(db, FIRESTORE_COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      fetchedCompanies.push({ 
        id, 
        name: data.name || initialCompanyDataFromCode[id].name,
        cnpj: data.cnpj || initialCompanyDataFromCode[id].cnpj,
        street: data.street || initialCompanyDataFromCode[id].street,
        number: data.number || initialCompanyDataFromCode[id].number,
        complement: data.complement || initialCompanyDataFromCode[id].complement,
        neighborhood: data.neighborhood || initialCompanyDataFromCode[id].neighborhood,
        city: data.city || initialCompanyDataFromCode[id].city,
        state: data.state || initialCompanyDataFromCode[id].state,
        cep: data.cep || initialCompanyDataFromCode[id].cep,
        phone: data.phone || initialCompanyDataFromCode[id].phone,
        email: data.email || initialCompanyDataFromCode[id].email,
        bankName: data.bankName,
        bankAgency: data.bankAgency,
        bankAccount: data.bankAccount,
        bankPixKey: data.bankPixKey,
      } as Company);
    } else {
      const initialData = initialCompanyDataFromCode[id];
      if (initialData) {
        console.warn(`CompanyConfig: Document for ${id} not found in Firestore. Using initial data from code. Consider seeding this data if it should persist.`);
        fetchedCompanies.push({ id, ...initialData });
      } else {
        console.error(`CompanyConfig: Document for ${id} not found and no initial data in code.`);
      }
    }
  }
  return fetchedCompanies;
}


export function CompanyConfigClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isCepLoading, setIsCepLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); 

  const form = useForm<z.infer<typeof CompanySchema>>({
    resolver: zodResolver(CompanySchema),
    defaultValues: {
      name: "", cnpj: "", 
      street: "", number: "", complement: "", neighborhood: "", city: "", state: "", cep: "",
      phone: "", email: "",
      bankName: "", bankAgency: "", bankAccount: "", bankPixKey: "",
    },
  });

  const { data: companies = [], isLoading, isError, error } = useQuery<Company[], Error>({
    queryKey: [FIRESTORE_COLLECTION_NAME],
    queryFn: fetchCompanyConfigs,
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

  const updateCompanyMutation = useMutation({
    mutationFn: async (companyData: Company) => {
      if (!db) {
        console.error("updateCompanyMutation: Firebase DB is not available.");
        throw new Error("Firebase DB is not available for updating company.");
      }
      const { id, ...rawDataToUpdate } = companyData;
      
      const dataToUpdate = Object.fromEntries(
        Object.entries(rawDataToUpdate).filter(([_, value]) => value !== undefined)
      );
      if (!id) throw new Error("ID da empresa é necessário para atualização.");
      const companyRef = doc(db, FIRESTORE_COLLECTION_NAME, id);
      const docSnap = await getDoc(companyRef);
      if (docSnap.exists()) {
        return updateDoc(companyRef, dataToUpdate);
      } else {
        console.log(`CompanyConfig: Document for ${id} not found. Creating it now.`);
        return setDoc(companyRef, dataToUpdate); 
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Informações da Empresa Atualizadas", description: `Os detalhes de ${variables.name} foram atualizados.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      console.error("Erro ao atualizar empresa:", err);
      toast({ title: "Erro ao Atualizar", description: `Não foi possível atualizar ${variables.name}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });


  const openModal = (company: Company) => {
    setEditingCompany(company);
    form.reset({
        ...company,
        phone: company.phone ? formatPhoneNumberForInputDisplay(company.phone) : ""
    });
    setIsEditMode(true); 
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCompany(null);
    setIsEditMode(false); 
    form.reset({ 
      name: "", cnpj: "", 
      street: "", number: "", complement: "", neighborhood: "", city: "", state: "", cep: "",
      phone: "", email: "",
      bankName: "", bankAgency: "", bankAccount: "", bankPixKey: ""
    });
  };

  const onSubmit = async (values: z.infer<typeof CompanySchema>) => {
    if (!editingCompany || !editingCompany.id) return;
    const dataToSave = {
        ...values,
        phone: values.phone ? values.phone.replace(/\D/g, '') : undefined,
    };
    updateCompanyMutation.mutate({ ...dataToSave, id: editingCompany.id });
  };
  
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

  if (isLoading && !isModalOpen) { 
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Carregando configurações...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Configurações</h2>
        <p className="text-center">Não foi possível buscar os dados. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: {error?.message}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Configurações das Empresas" />

      {companies.length === 0 && !isLoading ? (
         <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Building className="h-12 w-12 mb-4 text-primary" />
            <h2 className="text-xl font-semibold mb-2">Nenhuma Configuração de Empresa Encontrada</h2>
            <p className="text-center">Parece que as configurações iniciais não puderam ser carregadas ou criadas.</p>
         </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {companies.map((company) => {
            const displayAddress = formatAddressForDisplay(company);
            return (
              <Card 
                key={company.id} 
                className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col cursor-pointer"
                onClick={() => openModal(company)}
              >
                <CardHeader>
                  <CardTitle className="font-headline text-xl flex items-center">
                    <Building className="mr-2 h-6 w-6 text-primary" /> {company.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow space-y-2 text-sm">
                  <p className="flex items-center text-sm">
                    <ShieldQuestion className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">CNPJ:</span>
                    <span>{company.cnpj}</span>
                  </p>
                  <div className="flex items-start text-sm">
                    <MapPin className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" /> 
                    <div>
                      <span className="font-medium text-muted-foreground mr-1">Endereço:</span>
                      <span>{displayAddress}</span>
                    </div>
                  </div>
                  {company.phone && (
                    <p className="flex items-center text-sm">
                      <Phone className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">Telefone:</span>
                      <span>{formatPhoneNumberForInputDisplay(company.phone)}</span>
                    </p>
                  )}
                  {company.email && (
                    <p className="flex items-center text-sm">
                      <Mail className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">Email:</span>
                      <span>{company.email}</span>
                    </p>
                  )}
                  {company.bankName && (
                    <p className="flex items-center text-sm">
                      <Landmark className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">Banco:</span>
                      <span>{company.bankName}</span>
                    </p>
                  )}
                  {company.bankAgency && (
                    <p className="flex items-center text-sm">
                      <Hash className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">Agência:</span>
                      <span>{company.bankAgency}</span>
                    </p>
                  )}
                  {company.bankAccount && (
                    <p className="flex items-center text-sm">
                      <Contact className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">Conta:</span>
                      <span>{company.bankAccount}</span>
                    </p>
                  )}
                  {company.bankPixKey && (
                    <p className="flex items-center text-sm">
                      <QrCode className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">PIX:</span>
                      <span>{company.bankPixKey}</span>
                    </p>
                  )}
                </CardContent>
                <CardFooter className="border-t pt-4">
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={`Editar Informações da ${editingCompany?.name || 'Empresa'}`}
        description="Atualize os dados cadastrais e bancários da empresa."
        formId="company-form"
        isSubmitting={updateCompanyMutation.isPending}
        editingItem={editingCompany}
        isEditMode={isEditMode}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="company-form" className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Nome da Empresa</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="cnpj" render={({ field }) => (
              <FormItem><FormLabel>CNPJ</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
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
                  <Button type="button" variant="outline" onClick={handleSearchCep} disabled={isCepLoading}>
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
                <FormItem className="md:col-span-2"><FormLabel>Complemento (Opcional)</FormLabel><FormControl><Input placeholder="Ex: Apto 10, Bloco B" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
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

            <h3 className="text-md font-semibold pt-2 border-b pb-1 font-headline">Informações de Contato (Opcional)</h3>
            <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
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
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="contato@empresa.com" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />


            <h3 className="text-md font-semibold pt-2 border-b pb-1 font-headline">Informações Bancárias (Opcional)</h3>
            <FormField control={form.control} name="bankName" render={({ field }) => (
              <FormItem><FormLabel>Nome do Banco</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="bankAgency" render={({ field }) => (
                <FormItem><FormLabel>Agência</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="bankAccount" render={({ field }) => (
                <FormItem><FormLabel>Conta</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="bankPixKey" render={({ field }) => (
              <FormItem><FormLabel>Chave PIX</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
          </form>
        </Form>
      </FormModal>
    </>
  );
}
