
"use client";

import { useState, useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, CarFront, Tag, Gauge, Droplets, Coins, FileBadge, CircleCheck, WrenchIcon as WrenchIconMain, Loader2, AlertTriangle, DollarSign, Car, Fuel, Calendar as CalendarIcon, Clock } from "lucide-react"; // Added Clock
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import type { Vehicle, FuelingRecord, VehicleMaintenanceRecord } from "@/types";
import { VehicleSchema, FuelingRecordSchema, VehicleMaintenanceRecordSchema } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, arrayUnion, writeBatch } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDateForInput, formatDateForDisplay } from "@/lib/utils";

const statusOptions: Vehicle['status'][] = ['Disponível', 'Em Uso', 'Manutenção'];
const statusIcons = {
  Disponível: <CircleCheck className="h-4 w-4 text-green-500" />,
  'Em Uso': <CarFront className="h-4 w-4 text-blue-500" />,
  Manutenção: <WrenchIconMain className="h-4 w-4 text-yellow-500" />,
};

const FIRESTORE_COLLECTION_NAME = "veiculos";
const NO_MAINTENANCE_ALERT_VALUE = "_NO_ALERT_"; // Constante para o valor "Nenhum"

const mockVehiclesData: Omit<Vehicle, 'id' | 'fuelingHistory' | 'maintenanceHistory'>[] = [
  { model: "FIAT DOBLO", licensePlate: "ENC8C91", fipeValue: 29243, kind: "Furgão", currentMileage: 150000, fuelConsumption: 9.5, costPerKilometer: 0.6, status: "Disponível", registrationInfo: "Exemplo" },
  { model: "FIAT FIORINO", licensePlate: "FQC4777", fipeValue: 48869, kind: "Furgão", currentMileage: 80000, fuelConsumption: 11.0, costPerKilometer: 0.5, status: "Em Uso", registrationInfo: "Exemplo" },
];

async function fetchVehicles(): Promise<Vehicle[]> {
  if (!db) {
    console.error("fetchVehicles: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db!, FIRESTORE_COLLECTION_NAME), orderBy("model", "asc"), orderBy("licensePlate", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
        id: docSnap.id,
        model: data.model,
        licensePlate: data.licensePlate,
        kind: data.kind,
        currentMileage: Number(data.currentMileage),
        fuelConsumption: Number(data.fuelConsumption),
        costPerKilometer: Number(data.costPerKilometer),
        fipeValue: data.fipeValue !== undefined && data.fipeValue !== null ? Number(data.fipeValue) : null,
 year: data.year !== undefined && data.year !== null ? Number(data.year) : null,
        registrationInfo: data.registrationInfo,
        status: data.status,
        fuelingHistory: Array.isArray(data.fuelingHistory) ? data.fuelingHistory : [],
        maintenanceHistory: Array.isArray(data.maintenanceHistory) ? data.maintenanceHistory : [],
        nextMaintenanceType: data.nextMaintenanceType || null,
        nextMaintenanceKm: data.nextMaintenanceKm !== undefined && data.nextMaintenanceKm !== null ? Number(data.nextMaintenanceKm) : null,
        nextMaintenanceDate: data.nextMaintenanceDate || null,
        maintenanceNotes: data.maintenanceNotes || null,
    } as Vehicle;
  });
}

export function VehicleClientPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [isFuelingModalOpen, setIsFuelingModalOpen] = useState(false);
  const [selectedVehicleForFueling, setSelectedVehicleForFueling] = useState<Vehicle | null>(null);

  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [selectedVehicleForMaintenance, setSelectedVehicleForMaintenance] = useState<Vehicle | null>(null);

  const form = useForm<z.infer<typeof VehicleSchema>>({
    resolver: zodResolver(VehicleSchema),
    defaultValues: {
      model: "", licensePlate: "", kind: "", currentMileage: 0, fuelConsumption: 0, costPerKilometer: 0, year: null,
      fipeValue: null, registrationInfo: "", status: "Disponível", fuelingHistory: [], maintenanceHistory: [],
      nextMaintenanceType: null, nextMaintenanceKm: null, nextMaintenanceDate: null, maintenanceNotes: "",
    },
  });

  const nextMaintenanceTypeWatch = useWatch({ control: form.control, name: 'nextMaintenanceType' });


  const fuelingForm = useForm<z.infer<typeof FuelingRecordSchema>>({
    resolver: zodResolver(FuelingRecordSchema),
    defaultValues: {
      date: formatDateForInput(new Date()),
      liters: undefined,
      pricePerLiter: undefined,
      totalCost: undefined,
      mileageAtFueling: undefined,
      fuelStation: "",
      notes: "",
    },
  });

  const maintenanceForm = useForm<z.infer<typeof VehicleMaintenanceRecordSchema>>({
    resolver: zodResolver(VehicleMaintenanceRecordSchema),
    defaultValues: {
      date: formatDateForInput(new Date()),
      description: "",
      cost: undefined,
      mileageAtMaintenance: undefined,
      serviceProvider: "",
      notes: "",
    },
  });

  const liters = useWatch({ control: fuelingForm.control, name: 'liters' });
  const pricePerLiter = useWatch({ control: fuelingForm.control, name: 'pricePerLiter' });

  useEffect(() => {
    if (liters && pricePerLiter && typeof liters === 'number' && typeof pricePerLiter === 'number') {
      fuelingForm.setValue('totalCost', parseFloat((liters * pricePerLiter).toFixed(2)));
    }
  }, [liters, pricePerLiter, fuelingForm]);


  const { data: vehiclesFromFirestore = [], isLoading, isError, error } = useQuery<Vehicle[], Error>({
    queryKey: [FIRESTORE_COLLECTION_NAME],
    queryFn: fetchVehicles,
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

  const isMockDataActive = vehiclesFromFirestore.length === 0 && !isLoading && !isError;
  const vehiclesToDisplay = useMemo(() => {
    return isMockDataActive
      ? mockVehiclesData.map((v, i) => ({ ...v, id: `mock${i+1}`, fuelingHistory: [], maintenanceHistory: [] }))
      : vehiclesFromFirestore;
  }, [isMockDataActive, vehiclesFromFirestore]);


  const addVehicleMutation = useMutation({
    mutationFn: async (newVehicleData: z.infer<typeof VehicleSchema>) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para adicionar veículo.");
      const dataToSave = {
        ...newVehicleData,
        fuelingHistory: newVehicleData.fuelingHistory || [],
        maintenanceHistory: newVehicleData.maintenanceHistory || [],
        nextMaintenanceDate: newVehicleData.nextMaintenanceDate ? formatDateForInput(newVehicleData.nextMaintenanceDate) : null,
      };
      return addDoc(collection(db!, FIRESTORE_COLLECTION_NAME), dataToSave);
    },
    onSuccess: (docRef, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Veículo Adicionado", description: `${variables.model} (${variables.licensePlate}) adicionado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Adicionar", description: `Não foi possível adicionar ${variables.model}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const updateVehicleMutation = useMutation({
    mutationFn: async (vehicleData: Vehicle) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para atualizar veículo.");
      const { id, ...dataToUpdate } = vehicleData;
      if (!id || id.startsWith("mock")) throw new Error("ID do veículo inválido para atualização.");
      const vehicleRef = doc(db!, FIRESTORE_COLLECTION_NAME, id);
      const dataToSave = {
        ...dataToUpdate,
        fuelingHistory: dataToUpdate.fuelingHistory || [],
        maintenanceHistory: dataToUpdate.maintenanceHistory || [],
        nextMaintenanceDate: dataToUpdate.nextMaintenanceDate ? formatDateForInput(dataToUpdate.nextMaintenanceDate) : null,
      };
      return updateDoc(vehicleRef, dataToSave as { [key: string]: any });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Veículo Atualizado", description: `${variables.model} (${variables.licensePlate}) atualizado.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar", description: `Não foi possível atualizar ${variables.model}. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      if (!db) throw new Error("Conexão com Firebase não disponível para excluir veículo.");
      if (!vehicleId || vehicleId.startsWith("mock")) throw new Error("ID do veículo inválido para exclusão.");
      return deleteDoc(doc(db!, FIRESTORE_COLLECTION_NAME, vehicleId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Veículo Excluído", description: `O veículo foi removido.` });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Excluir", description: `Não foi possível excluir o veículo. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const addFuelingRecordMutation = useMutation({
    mutationFn: async ({ vehicleId, newRecord, currentMileage }: { vehicleId: string; newRecord: FuelingRecord; currentMileage: number }) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      const vehicleRef = doc(db, FIRESTORE_COLLECTION_NAME, vehicleId);
      const batch = writeBatch(db);

      batch.update(vehicleRef, {
        fuelingHistory: arrayUnion(newRecord)
      });

      if (newRecord.mileageAtFueling > currentMileage) {
        batch.update(vehicleRef, { currentMileage: newRecord.mileageAtFueling });
      }

      await batch.commit();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Abastecimento Registrado", description: "O novo registro de abastecimento foi salvo." });
      closeFuelingModal();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Registrar Abastecimento", description: error.message, variant: "destructive" });
    },
  });

  const addMaintenanceRecordMutation = useMutation({
    mutationFn: async ({ vehicleId, newRecord, currentMileage }: { vehicleId: string; newRecord: VehicleMaintenanceRecord; currentMileage: number }) => {
      if (!db) throw new Error("Conexão com Firebase não disponível.");
      const vehicleRef = doc(db, FIRESTORE_COLLECTION_NAME, vehicleId);
      const batch = writeBatch(db);

      batch.update(vehicleRef, {
        maintenanceHistory: arrayUnion(newRecord)
      });

      if (newRecord.mileageAtMaintenance > currentMileage) {
        batch.update(vehicleRef, { currentMileage: newRecord.mileageAtMaintenance });
      }
      await batch.commit();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Manutenção Registrada", description: "O novo registro de manutenção foi salvo." });
      closeMaintenanceModal();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao Registrar Manutenção", description: error.message, variant: "destructive" });
    },
  });

  const openModal = (vehicle?: Vehicle) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      form.reset({
        ...vehicle,
        currentMileage: Number(vehicle.currentMileage),
        fuelConsumption: Number(vehicle.fuelConsumption),
        costPerKilometer: Number(vehicle.costPerKilometer),
        fipeValue: vehicle.fipeValue !== undefined && vehicle.fipeValue !== null ? Number(vehicle.fipeValue) : null,
 year: vehicle.year !== undefined && vehicle.year !== null ? Number(vehicle.year) : null,
        fuelingHistory: vehicle.fuelingHistory || [],
        maintenanceHistory: vehicle.maintenanceHistory || [],
        nextMaintenanceType: vehicle.nextMaintenanceType || null,
        nextMaintenanceKm: vehicle.nextMaintenanceKm !== undefined ? vehicle.nextMaintenanceKm : null,
        nextMaintenanceDate: vehicle.nextMaintenanceDate ? formatDateForInput(vehicle.nextMaintenanceDate) : null,
        maintenanceNotes: vehicle.maintenanceNotes || "",
      });
      setIsEditMode(false);
    } else {
      setEditingVehicle(null);
      form.reset({
        model: "", licensePlate: "", kind: "", currentMileage: 0, fuelConsumption: 0, costPerKilometer: 0, year: null,
        fipeValue: null, registrationInfo: "", status: "Disponível", fuelingHistory: [], maintenanceHistory: [],
        nextMaintenanceType: null, nextMaintenanceKm: null, nextMaintenanceDate: null, maintenanceNotes: "",
      });
      setIsEditMode(true);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingVehicle(null);
    form.reset();
    setIsEditMode(false);
  };

  const onSubmit = async (values: z.infer<typeof VehicleSchema>) => {
    const dataToSubmit = {
      ...values,
      nextMaintenanceDate: values.nextMaintenanceDate ? formatDateForInput(values.nextMaintenanceDate) : null,
    };

    if (editingVehicle && editingVehicle.id && !editingVehicle.id.startsWith("mock")) {
      updateVehicleMutation.mutate({ ...dataToSubmit, id: editingVehicle.id, fuelingHistory: editingVehicle.fuelingHistory || [], maintenanceHistory: editingVehicle.maintenanceHistory || [] });
    } else {
      addVehicleMutation.mutate(dataToSubmit);
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingVehicle && editingVehicle.id && !editingVehicle.id.startsWith("mock")) {
       if (window.confirm(`Tem certeza que deseja excluir o veículo "${editingVehicle.model} (${editingVehicle.licensePlate})"?`)) {
        deleteVehicleMutation.mutate(editingVehicle.id);
      }
    } else {
      toast({ title: "Ação Inválida", description: "Não é possível excluir um veículo de exemplo ou não salvo.", variant: "default" });
    }
  };

  const openFuelingModal = (vehicle: Vehicle) => {
    setSelectedVehicleForFueling(vehicle);
    fuelingForm.reset({
      date: formatDateForInput(new Date().toISOString()),
      liters: undefined,
      pricePerLiter: undefined,
      totalCost: undefined,
      mileageAtFueling: vehicle.currentMileage || undefined,
      fuelStation: "",
      notes: "",
    });
    setIsFuelingModalOpen(true);
  };

  const closeFuelingModal = () => {
    setIsFuelingModalOpen(false);
    setSelectedVehicleForFueling(null);
    fuelingForm.reset();
  };

  const onFuelingSubmit = async (values: z.infer<typeof FuelingRecordSchema>) => {
    if (!selectedVehicleForFueling || selectedVehicleForFueling.id.startsWith("mock")) {
      toast({ title: "Erro", description: "Veículo inválido para registrar abastecimento.", variant: "destructive" });
      return;
    }
    if (values.mileageAtFueling < selectedVehicleForFueling.currentMileage) {
        if(!window.confirm(`A quilometragem informada (${values.mileageAtFueling} km) é menor que a quilometragem atual do veículo (${selectedVehicleForFueling.currentMileage} km). Deseja continuar?`)){
            return;
        }
    }

    const newRecord: FuelingRecord = {
      ...values,
      id: crypto.randomUUID(),
      totalCost: values.totalCost || (values.liters * values.pricePerLiter),
    };

    addFuelingRecordMutation.mutate({
      vehicleId: selectedVehicleForFueling.id,
      newRecord,
      currentMileage: selectedVehicleForFueling.currentMileage,
    });
  };

  const openMaintenanceModal = (vehicle: Vehicle) => {
    setSelectedVehicleForMaintenance(vehicle);
    maintenanceForm.reset({
      date: formatDateForInput(new Date().toISOString()),
      description: "",
      cost: undefined,
      mileageAtMaintenance: vehicle.currentMileage || undefined,
      serviceProvider: "",
      notes: "",
    });
    setIsMaintenanceModalOpen(true);
  };

  const closeMaintenanceModal = () => {
    setIsMaintenanceModalOpen(false);
    setSelectedVehicleForMaintenance(null);
    maintenanceForm.reset();
  };

  const onMaintenanceSubmit = async (values: z.infer<typeof VehicleMaintenanceRecordSchema>) => {
    if (!selectedVehicleForMaintenance || selectedVehicleForMaintenance.id.startsWith("mock")) {
      toast({ title: "Erro", description: "Veículo inválido para registrar manutenção.", variant: "destructive" });
      return;
    }
     if (values.mileageAtMaintenance < selectedVehicleForMaintenance.currentMileage) {
        if(!window.confirm(`A quilometragem informada (${values.mileageAtMaintenance} km) é menor que a quilometragem atual do veículo (${selectedVehicleForMaintenance.currentMileage} km). Deseja continuar?`)){
            return;
        }
    }
    const newRecord: VehicleMaintenanceRecord = {
      ...values,
      id: crypto.randomUUID(),
    };
    addMaintenanceRecordMutation.mutate({
      vehicleId: selectedVehicleForMaintenance.id,
      newRecord,
      currentMileage: selectedVehicleForMaintenance.currentMileage,
    });
  };


  const isMutating = addVehicleMutation.isPending || updateVehicleMutation.isPending;

  if (isLoading && !isModalOpen && !isFuelingModalOpen && !isMaintenanceModalOpen) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Carregando veículos...</p>
      </div>
    );
  }

  if (isError) {
     return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Veículos</h2>
        <p className="text-center">Não foi possível buscar os dados. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: {error?.message}</p>
      </div>
    );
  }

  const sortedFuelingHistory = editingVehicle?.fuelingHistory
    ? [...editingVehicle.fuelingHistory].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
    : [];

  const sortedMaintenanceHistory = editingVehicle?.maintenanceHistory
    ? [...editingVehicle.maintenanceHistory].sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
    : [];

  return (
    <>
      <PageHeader
        title=""
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating || deleteVehicleMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Veículo
          </Button>
        }
      />
      <p className="text-muted-foreground text-sm mb-6 -mt-4">
        Gerenciamento da frota de veículos da empresa utilizados para serviços externos. Permite cadastrar veículos, registrar abastecimentos, histórico de manutenções e controlar informações como quilometragem, consumo e custos.
      </p>

      {isMockDataActive && (
         <Card className="mb-6 bg-accent/10 border-accent/30 shadow-sm">
          <CardHeader>
            <CardTitle className="text-accent-foreground font-headline text-lg">Dados de Exemplo Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/80">
              Os veículos listados abaixo são exemplos para demonstração, pois nenhum veículo foi encontrado no banco de dados.
              Clique em um card para preencher o formulário e então salve para adicioná-lo permanentemente.
            </p>
          </CardContent>
        </Card>
      )}

      {vehiclesToDisplay.length === 0 && !isMockDataActive ? (
        <DataTablePlaceholder
          icon={CarFront}
          title="Nenhum Veículo Registrado"
          description="Registre seu primeiro veículo para gerenciar sua frota."
          buttonLabel="Adicionar Veículo"
          onButtonClick={() => openModal()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehiclesToDisplay.map((vehicle) => (
            <Card
              key={vehicle.id}
              className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 "
            >
              <div onClick={() => openModal(vehicle)} className="cursor-pointer flex-grow">
                <CardHeader>
                  <CardTitle className="font-headline text-xl text-primary">{vehicle.model}</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow space-y-2 text-sm">
                  <p className="flex items-center text-sm">
                    <Tag className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Placa:</span>
                    <span>{vehicle.licensePlate}</span>
                  </p>
                  <p className="flex items-center text-sm">
                    <Car className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Tipo:</span>
                    <span>{vehicle.kind}</span>
                  </p>
                  <p className="flex items-center text-sm">
                    <Gauge className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-medium text-muted-foreground mr-1">KM Atual:</span>
                    <span>{Number(vehicle.currentMileage).toLocaleString('pt-BR')} km</span>
                  </p>
                  <p className="flex items-center text-sm">
                    <Droplets className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-medium text-muted-foreground mr-1">Consumo Médio:</span>
                    <span>{Number(vehicle.fuelConsumption)} km/L</span>
                  </p>
                  <p className="flex items-center text-sm">
                    <Coins className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-medium text-muted-foreground mr-1">Custo Médio/km:</span>
                    <span>R$ {Number(vehicle.costPerKilometer).toFixed(2)}</span>
                  </p>
                  {vehicle.fipeValue !== null && vehicle.fipeValue !== undefined && (
                    <p className="flex items-center text-sm">
                      <DollarSign className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">FIPE:</span>
                      <span>{Number(vehicle.fipeValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </p>
                  )}
                  <p className="flex items-center text-sm">
                    {statusIcons[vehicle.status]}
                    <span className="font-medium text-muted-foreground ml-2 mr-1">Status:</span>
                    <span className={cn({
                      'text-green-600': vehicle.status === 'Disponível',
                      'text-blue-600': vehicle.status === 'Em Uso',
                      'text-yellow-600': vehicle.status === 'Manutenção',
                    })}>
                      {vehicle.status}
                    </span>
                  </p>
                  {vehicle.registrationInfo && (
                    <p className="flex items-center text-sm">
                      <FileBadge className="mr-2 h-4 w-4 text-primary" />
                      <span className="font-medium text-muted-foreground mr-1">Registro:</span>
                      <span>{vehicle.registrationInfo}</span>
                    </p>
                  )}
                </CardContent>
              </div>
              <CardFooter className="border-t pt-4 flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMaintenanceModal(vehicle);
                  }}
                  disabled={vehicle.id.startsWith("mock") || addMaintenanceRecordMutation.isPending}
                  className="text-amber-600 border-amber-600 hover:bg-amber-600/10 hover:text-amber-700"
                >
                  <WrenchIconMain className="mr-2 h-4 w-4" />
                  Manutenção
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFuelingModal(vehicle);
                  }}
                  disabled={vehicle.id.startsWith("mock") || addFuelingRecordMutation.isPending}
                  className="text-primary border-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Fuel className="mr-2 h-4 w-4" />
                  Abastecimento
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingVehicle && editingVehicle.id && !editingVehicle.id.startsWith("mock") ? "Editar Veículo" : "Adicionar Novo Veículo"}
        description="Forneça os detalhes do veículo."
        formId="vehicle-form"
        isSubmitting={isMutating}
        editingItem={editingVehicle && editingVehicle.id && !editingVehicle.id.startsWith("mock") ? editingVehicle : null}
        onDeleteConfirm={handleModalDeleteConfirm}
        isDeleting={deleteVehicleMutation.isPending}
        deleteButtonLabel="Excluir Veículo"
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="vehicle-form" className="space-y-4">
            <fieldset disabled={!!editingVehicle && !isEditMode} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="model" render={({ field }) => (
                    <FormItem><FormLabel>Modelo</FormLabel><FormControl><Input placeholder="ex: Fiat Fiorino" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="licensePlate" render={({ field }) => (
                    <FormItem><FormLabel>Placa</FormLabel><FormControl><Input placeholder="ABC1D23" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="kind" render={({ field }) => (
                    <FormItem><FormLabel>Tipo</FormLabel><FormControl><Input placeholder="ex: Van, Carro, Moto" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="currentMileage" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quilometragem Atual (km)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any" {...field}
                          onChange={e => {
                            const rawValue = e.target.value;
                            field.onChange(rawValue === '' ? null : parseFloat(rawValue));
                          }}
                          value={String(field.value ?? '')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="fuelConsumption" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Consumo Médio (km/L)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any" {...field}
                          onChange={e => {
                            const rawValue = e.target.value;
                             field.onChange(rawValue === '' ? null : parseFloat(rawValue));
                          }}
                          value={String(field.value ?? '')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="costPerKilometer" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custo Médio por KM (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="any" {...field}
                           onChange={e => {
                            const rawValue = e.target.value;
                            field.onChange(rawValue === '' ? null : parseFloat(rawValue));
                          }}
                          value={String(field.value ?? '')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="fipeValue" render={({ field }) => (
                      <FormItem>
                          <FormLabel>Valor Tabela FIPE (R$) (Opcional)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              placeholder="Ex: 29243" {...field}
                              onChange={e => {
                                const rawValue = e.target.value;
                                field.onChange(rawValue === '' ? null : parseFloat(rawValue));
                              }}
                              value={String(field.value ?? '')}
                            />
                          </FormControl>
                          <FormMessage />
                      </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem><FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger></FormControl>
                        <SelectContent>{statusOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>
                  )} />
                </div>
 <FormField control={form.control} name="year" render={({ field }) => (
 <FormItem>
 <FormLabel>Ano de Fabricação</FormLabel>
 <FormControl>
 <Input type="number" placeholder="Ex: 2018" {...field}
 onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
 value={field.value ?? ""}
 />
 </FormControl><FormMessage /></FormItem>
 )} />

              <FormField control={form.control} name="registrationInfo" render={({ field }) => (
                <FormItem><FormLabel>Informações de Registro (Opcional)</FormLabel><FormControl><Input placeholder="ex: Renavam, Chassi" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />

              <h3 className="text-md font-semibold pt-4 border-t mt-4 pb-1 font-headline">Alerta Próxima Manutenção</h3>
              <FormField
                control={form.control}
                name="nextMaintenanceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alertar por</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value === NO_MAINTENANCE_ALERT_VALUE ? null : value);
                      }}
                      value={field.value || NO_MAINTENANCE_ALERT_VALUE}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione tipo de alerta" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_MAINTENANCE_ALERT_VALUE}>Nenhum</SelectItem>
                        <SelectItem value="km">Quilometragem</SelectItem>
                        <SelectItem value="date">Data</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {nextMaintenanceTypeWatch === 'km' && (
                <FormField
                  control={form.control}
                  name="nextMaintenanceKm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Próxima Manutenção em (KM)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ex: 160000"
                          {...field}
                          onChange={e => field.onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {nextMaintenanceTypeWatch === 'date' && (
                <FormField
                  control={form.control}
                  name="nextMaintenanceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data da Próxima Manutenção</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ? formatDateForInput(field.value) : ""}
                          onChange={e => field.onChange(e.target.value ? formatDateForInput(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="maintenanceNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas da Próxima Manutenção (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Ex: Trocar óleo e filtro, verificar correias..." {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>

            {editingVehicle && !editingVehicle.id.startsWith("mock") && (
              <>
                <div className="mt-6 pt-4 border-t">
                  <h3 className="text-lg font-semibold mb-2 font-headline">Histórico de Abastecimentos</h3>
                  {sortedFuelingHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum abastecimento registrado para este veículo.</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead className="text-right">Litros</TableHead>
                            <TableHead className="text-right">Preço/L</TableHead>
                            <TableHead className="text-right">Custo Total</TableHead>
                            <TableHead className="text-right">KM</TableHead>
                            <TableHead>Posto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedFuelingHistory.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell>{formatDateForDisplay(record.date)}</TableCell>
                              <TableCell className="text-right">{record.liters.toFixed(2)} L</TableCell>
                              <TableCell className="text-right">R$ {record.pricePerLiter.toFixed(2)}</TableCell>
                              <TableCell className="text-right">R$ {record.totalCost.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{record.mileageAtFueling.toLocaleString('pt-BR')} km</TableCell>
                              <TableCell>{record.fuelStation || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
                <div className="mt-6 pt-4 border-t">
                  <h3 className="text-lg font-semibold mb-2 font-headline">Histórico de Manutenções</h3>
                  {sortedMaintenanceHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma manutenção registrada para este veículo.</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="text-right">Custo</TableHead>
                            <TableHead className="text-right">KM</TableHead>
                            <TableHead>Fornecedor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedMaintenanceHistory.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell>{formatDateForDisplay(record.date)}</TableCell>
                              <TableCell>{record.description}</TableCell>
                              <TableCell className="text-right">R$ {record.cost.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{record.mileageAtMaintenance.toLocaleString('pt-BR')} km</TableCell>
                              <TableCell>{record.serviceProvider || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </>
            )}
          </form>
        </Form>
      </FormModal>

      {selectedVehicleForFueling && (
        <FormModal
          isOpen={isFuelingModalOpen}
          onClose={closeFuelingModal}
          title={`Registrar Abastecimento: ${selectedVehicleForFueling.model} (${selectedVehicleForFueling.licensePlate})`}
          description="Preencha os detalhes do abastecimento."
          formId="fueling-form"
          isSubmitting={addFuelingRecordMutation.isPending}
          isEditMode={true}
          submitButtonLabel="Registrar Abastecimento"
        >
          <Form {...fuelingForm}>
            <form onSubmit={fuelingForm.handleSubmit(onFuelingSubmit)} id="fueling-form" className="space-y-4">
              <FormField control={fuelingForm.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do Abastecimento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={fuelingForm.control} name="liters" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Litros Abastecidos</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="Ex: 45.50" {...field}
                     onChange={e => field.onChange(parseFloat(e.target.value) || null)}
                    /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={fuelingForm.control} name="pricePerLiter" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço por Litro (R$)</FormLabel>
                    <FormControl><Input type="number" step="0.001" placeholder="Ex: 5.899" {...field}
                     onChange={e => field.onChange(parseFloat(e.target.value) || null)}
                    /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={fuelingForm.control} name="totalCost" render={({ field }) => (
                <FormItem>
                  <FormLabel>Custo Total (R$)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="Calculado ou manual" {...field}
                   onChange={e => field.onChange(parseFloat(e.target.value) || null)}
                  /></FormControl>
                   <FormDescription>Será calculado se litros e preço/litro forem preenchidos.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={fuelingForm.control} name="mileageAtFueling" render={({ field }) => (
                <FormItem>
                  <FormLabel>Quilometragem no Abastecimento (km)</FormLabel>
                  <FormControl><Input type="number" placeholder="Ex: 150250" {...field}
                   onChange={e => field.onChange(parseInt(e.target.value, 10) || null)}
                  /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={fuelingForm.control} name="fuelStation" render={({ field }) => (
                <FormItem>
                  <FormLabel>Posto de Combustível (Opcional)</FormLabel>
                  <FormControl><Input placeholder="Ex: Posto Shell Av. Principal" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={fuelingForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações (Opcional)</FormLabel>
                  <FormControl><Textarea placeholder="Alguma observação sobre este abastecimento?" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
        </FormModal>
      )}

      {selectedVehicleForMaintenance && (
        <FormModal
          isOpen={isMaintenanceModalOpen}
          onClose={closeMaintenanceModal}
          title={`Registrar Manutenção: ${selectedVehicleForMaintenance.model} (${selectedVehicleForMaintenance.licensePlate})`}
          description="Preencha os detalhes da manutenção."
          formId="maintenance-form"
          isSubmitting={addMaintenanceRecordMutation.isPending}
          isEditMode={true}
          submitButtonLabel="Registrar Manutenção"
        >
          <Form {...maintenanceForm}>
            <form onSubmit={maintenanceForm.handleSubmit(onMaintenanceSubmit)} id="maintenance-form" className="space-y-4">
              <FormField control={maintenanceForm.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data da Manutenção</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={maintenanceForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição do Serviço</FormLabel>
                  <FormControl><Textarea placeholder="Ex: Troca de óleo e filtros" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={maintenanceForm.control} name="cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custo Total (R$)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="Ex: 350.00" {...field}
                    onChange={e => field.onChange(parseFloat(e.target.value) || null)}
                    /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={maintenanceForm.control} name="mileageAtMaintenance" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quilometragem na Manutenção (km)</FormLabel>
                    <FormControl><Input type="number" placeholder="Ex: 155300" {...field}
                     onChange={e => field.onChange(parseInt(e.target.value, 10) || null)}
                    /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={maintenanceForm.control} name="serviceProvider" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fornecedor / Oficina (Opcional)</FormLabel>
                  <FormControl><Input placeholder="Ex: Oficina do Zé" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={maintenanceForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações (Opcional)</FormLabel>
                  <FormControl><Textarea placeholder="Detalhes adicionais sobre a manutenção" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </form>
          </Form>
        </FormModal>
      )}
    </>
  );
}
