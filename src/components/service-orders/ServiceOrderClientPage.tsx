
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, ClipboardList, User, Construction, HardHat, Settings2, Calendar, FileText, Play, Check, AlertTriangle as AlertIconLI, X, Loader2, CarFront as VehicleIcon, UploadCloud, Link as LinkIconLI, XCircle, AlertTriangle, Save, Trash2, Pencil, ClipboardEdit, ThumbsUp, PackageSearch, Ban, Phone, Building, Route, Coins as CoinsIcon, Brain, Search as SearchIcon, Tag, Layers, CalendarDays as CalendarIconDetails, MapPin, Printer } from "lucide-react";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { ServiceOrder, Customer, Maquina, Technician, Vehicle, ServiceOrderPhaseType, OwnerReferenceType, Company, CompanyId } from "@/types";
import { ServiceOrderSchema, serviceTypeOptionsList, serviceOrderPhaseOptions, companyDisplayOptions, OWNER_REF_CUSTOMER, companyIds, maquinaTypeOptions, maquinaOperationalStatusOptions, GOLDMAQ_COMPANY_ID } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/ui/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, setDoc, type DocumentData, getDoc, limit } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isBefore, isToday, addDays, parseISO, isValid, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toTitleCase, getFileNameFromUrl, formatDateForInput, getWhatsAppNumber, formatPhoneNumberForInputDisplay, parseNumericToNullOrNumber, formatAddressForDisplay, generateGoogleMapsUrl, formatDateForDisplay } from "@/lib/utils";
import { calculateDistance, type CalculateDistanceOutput } from '@/ai/flows/calculate-distance-flow';


const MAX_FILES_ALLOWED = 5;

const phaseIcons: Record<ServiceOrderPhaseType, JSX.Element> = {
  'Aguardando Avaliação Técnica': <ClipboardEdit className="h-4 w-4 text-yellow-500" />,
  'Avaliado, Aguardando Autorização': <ThumbsUp className="h-4 w-4 text-purple-500" />,
  'Autorizado, Aguardando Peça': <PackageSearch className="h-4 w-4 text-orange-500" />,
  'Em Execução': <Play className="h-4 w-4 text-blue-500" />,
  'Concluída': <Check className="h-4 w-4 text-green-500" />,
  'Cancelada': <Ban className="h-4 w-4 text-red-500" />,
};

const FIRESTORE_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";
const FIRESTORE_EQUIPMENT_COLLECTION_NAME = "equipamentos";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";
const FIRESTORE_VEHICLE_COLLECTION_NAME = "veiculos";
const FIRESTORE_COMPANY_COLLECTION_NAME = "empresas";


const NO_VEHICLE_SELECTED_VALUE = "_NO_VEHICLE_SELECTED_";
const LOADING_VEHICLES_SELECT_ITEM_VALUE = "_LOADING_VEHICLES_";
const CUSTOM_SERVICE_TYPE_VALUE = "_CUSTOM_";
const NO_EQUIPMENT_SELECTED_VALUE = "_NO_EQUIPMENT_SELECTED_";
const LOADING_EQUIPMENT_SELECT_ITEM_VALUE = "_LOADING_EQUIPMENT_";
const NO_TECHNICIAN_SELECTED_VALUE = "_NO_TECHNICIAN_SELECTED_";
const LOADING_TECHNICIANS_SELECT_ITEM_VALUE = "_LOADING_TECHNICIANS_";

const convertToTimestamp = (dateString?: string | null): Timestamp | null => {
  if (!dateString) return null;
  const date = parseISO(dateString);
  if (!isValid(date)) return null;
  return Timestamp.fromDate(date);
};

async function fetchServiceOrders(): Promise<ServiceOrder[]> {
  if (!db) {
    console.error("fetchServiceOrders: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db, FIRESTORE_COLLECTION_NAME), orderBy("startDate", "desc"), orderBy("orderNumber", "desc"), limit(50));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data() as DocumentData;
    const serviceOrder: ServiceOrder = {
      id: docSnap.id,
      orderNumber: data.orderNumber || "N/A",
      customerId: data.customerId || "N/A",
      equipmentId: data.equipmentId || "N/A",
      requesterName: data.requesterName || null,
      phase: (serviceOrderPhaseOptions.includes(data.phase) ? data.phase : "Aguardando Avaliação Técnica") as ServiceOrderPhaseType,
      technicianId: data.technicianId || null,
      serviceType: data.serviceType || "Não especificado",
      customServiceType: data.customServiceType,
      vehicleId: data.vehicleId || null,
      startDate: data.startDate ? formatDateForInput(data.startDate) : undefined,
      endDate: data.endDate ? formatDateForInput(data.endDate) : undefined,
      description: data.description || "N/A",
      notes: data.notes || null,
      mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls.filter(url => typeof url === 'string') : [],
      technicalConclusion: data.technicalConclusion || null,
      estimatedTravelDistanceKm: data.estimatedTravelDistanceKm !== undefined ? Number(data.estimatedTravelDistanceKm) : null,
      estimatedTollCosts: data.estimatedTollCosts !== undefined ? Number(data.estimatedTollCosts) : null,
      estimatedTravelCost: data.estimatedTravelCost !== undefined ? Number(data.estimatedTravelCost) : null,
    };
    return serviceOrder;
  });
}

async function fetchCustomers(): Promise<Customer[]> {
  if (!db) {
    console.error("fetchCustomers: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db, FIRESTORE_CUSTOMER_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Customer));
}

async function fetchEquipment(): Promise<Maquina[]> {
  if (!db) {
    console.error("fetchEquipment: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db, FIRESTORE_EQUIPMENT_COLLECTION_NAME), orderBy("brand", "asc"));
  const querySnapshot = await getDocs(q);
 return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      brand: data.brand || "Marca Desconhecida",
      model: data.model || "Modelo Desconhecido",
      chassisNumber: data.chassisNumber || "N/A",
      equipmentType: (data.equipmentType || "Empilhadeira Contrabalançada GLP") as typeof maquinaTypeOptions[number] | string,
      manufactureYear: parseNumericToNullOrNumber(data.manufactureYear),
      operationalStatus: (data.operationalStatus || "Disponível") as typeof maquinaOperationalStatusOptions[number],
      customerId: data.customerId || null,
      ownerReference: data.ownerReference || null,
      towerOpenHeightMm: parseNumericToNullOrNumber(data.towerOpenHeightMm),
      towerClosedHeightMm: parseNumericToNullOrNumber(data.towerClosedHeightMm),
      nominalCapacityKg: parseNumericToNullOrNumber(data.nominalCapacityKg),
    } as Maquina;
  });
}

async function fetchTechnicians(): Promise<Technician[]> {
  if (!db) {
    console.error("fetchTechnicians: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db, FIRESTORE_TECHNICIAN_COLLECTION_NAME), orderBy("name", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Technician));
}

async function fetchVehicles(): Promise<Vehicle[]> {
  if (!db) {
    console.error("fetchVehicles: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const q = query(collection(db, FIRESTORE_VEHICLE_COLLECTION_NAME), orderBy("model", "asc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Vehicle));
}

async function fetchCompanyById(companyId: CompanyId): Promise<Company | null> {
  if (!db) {
    console.error(`fetchCompanyById (${companyId}): Firebase DB is not available.`);
    throw new Error("Firebase DB is not available");
  }
  const docRef = doc(db, FIRESTORE_COMPANY_COLLECTION_NAME, companyId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id as CompanyId, ...docSnap.data() } as Company;
  }
  console.warn(`fetchCompanyById: Company with ID ${companyId} not found.`);
  return null;
}


const getNextOrderNumber = (currentOrders: ServiceOrder[]): string => {
  let maxOrderNum = 3999;
  currentOrders.forEach(order => {
    if (order.orderNumber) {
        const num = parseInt(order.orderNumber, 10);
        if (!isNaN(num) && num > maxOrderNum) {
        maxOrderNum = num;
        }
    }
  });
  return (maxOrderNum + 1).toString();
};

type DeadlineStatus = 'overdue' | 'due_today' | 'due_soon' | 'none';

const getDeadlineStatusInfo = (
  endDateString?: string,
  phase?: ServiceOrderPhaseType
): { status: DeadlineStatus; message?: string; icon?: JSX.Element; alertClass?: string } => {
  if (!endDateString || phase === 'Concluída' || phase === 'Cancelada') {
    return { status: 'none', alertClass: "" };
  }

  const parsedEndDate = parseISO(endDateString);
  if (!isValid(parsedEndDate)) {
    return { status: 'none', alertClass: "" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDateNormalized = new Date(parsedEndDate.getFullYear(), parsedEndDate.getMonth(), parsedEndDate.getDate());
  endDateNormalized.setHours(0,0,0,0);

  if (isBefore(endDateNormalized, today) && !isToday(endDateNormalized)) {
    return { status: 'overdue', message: 'Atrasada!', icon: <AlertTriangle className="h-5 w-5 text-destructive" />, alertClass: "bg-destructive/20 border-destructive/50 text-destructive" };
  }
  if (isToday(endDateNormalized)) {
    return { status: 'due_today', message: 'Vence Hoje!', icon: <AlertTriangle className="h-5 w-5 text-accent" />, alertClass: "bg-accent/20 border-accent/50 text-accent" };
  }
  const twoDaysFromNow = addDays(today, 2);
  if (isBefore(endDateNormalized, twoDaysFromNow)) {
     return { status: 'due_soon', message: 'Vence em Breve', icon: <AlertTriangle className="h-5 w-5 text-accent" />, alertClass: "bg-accent/20 border-accent/50 text-accent" };
  }
  return { status: 'none', alertClass: "" };
};

const formatAddressToString = (addressSource: Customer | Company | null | undefined): string => {
    if (!addressSource) return "";
    const parts = [
        addressSource.street,
        addressSource.number,
        addressSource.complement,
        addressSource.neighborhood,
        addressSource.city,
        addressSource.state,
        addressSource.cep,
    ].filter(Boolean).join(', ');
    return parts;
};

async function uploadServiceOrderFile(
  file: File,
  orderId: string
): Promise<string> {
  if (!storage) {
    console.error("uploadServiceOrderFile: Firebase Storage is not available.");
    throw new Error("Firebase Storage is not available");
  }
  const filePath = `service_order_media/${orderId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fileStorageRef = storageRef(storage, filePath);
  await uploadBytes(fileStorageRef, file);
  return getDownloadURL(fileStorageRef);
}

async function deleteServiceOrderFileFromStorage(fileUrl?: string | null) {
  if (fileUrl) {
    if (!storage) {
      console.warn("deleteServiceOrderFileFromStorage: Firebase Storage is not available. Skipping deletion.");
      return;
    }
    try {
      const gcsPath = new URL(fileUrl).pathname.split('/o/')[1].split('?')[0];
      const decodedPath = decodeURIComponent(gcsPath);
      const fileStorageRef = storageRef(storage, decodedPath);
      await deleteObject(fileStorageRef);
    } catch (e) {
      console.warn(`[DELETE SO FILE] Failed to delete file from storage: ${fileUrl}`, e);
    }
  }
}

interface ServiceOrderClientPageProps {
  serviceOrderIdFromUrl?: string | null;
}

export function ServiceOrderClientPage({ serviceOrderIdFromUrl }: ServiceOrderClientPageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [showCustomServiceType, setShowCustomServiceType] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isConclusionModalOpen, setIsConclusionModalOpen] = useState(false);
  const [technicalConclusionText, setTechnicalConclusionText] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<ServiceOrderPhaseType | "Todos">("Todos");
  const [isCancelConfirmModalOpen, setIsCancelConfirmModalOpen] = useState(false);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");


  const form = useForm<z.infer<typeof ServiceOrderSchema>>({
    resolver: zodResolver(ServiceOrderSchema),
    defaultValues: {
      orderNumber: "", customerId: "", equipmentId: "", phase: "Aguardando Avaliação Técnica", technicianId: null,
      requesterName: "", serviceType: "", customServiceType: "", vehicleId: null, description: "",
      notes: "", startDate: formatDateForInput(new Date().toISOString()), endDate: "",
      mediaUrls: [], technicalConclusion: null,
      estimatedTravelDistanceKm: null, estimatedTollCosts: null, estimatedTravelCost: null,
    },
  });

  const selectedCustomerId = useWatch({ control: form.control, name: 'customerId' });
  const formEquipmentId = useWatch({ control: form.control, name: 'equipmentId' });
  const formMediaUrls = useWatch({ control: form.control, name: 'mediaUrls' });
  const formVehicleId = useWatch({ control: form.control, name: 'vehicleId' });
  const formEstimatedTravelDistanceKm = useWatch({ control: form.control, name: 'estimatedTravelDistanceKm' });
  const formEstimatedTollCosts = useWatch({ control: form.control, name: 'estimatedTollCosts' });


  const { data: serviceOrdersRaw = [], isLoading: isLoadingServiceOrders, isError: isErrorServiceOrders, error: errorServiceOrdersData } = useQuery<ServiceOrder[], Error>({
    queryKey: [FIRESTORE_COLLECTION_NAME],
    queryFn: fetchServiceOrders,
    enabled: !!db,
  });

  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[], Error>({
    queryKey: [FIRESTORE_CUSTOMER_COLLECTION_NAME],
    queryFn: fetchCustomers,
    enabled: !!db,
  });

  const { data: equipmentList = [], isLoading: isLoadingEquipment } = useQuery<Maquina[], Error>({
    queryKey: [FIRESTORE_EQUIPMENT_COLLECTION_NAME],
    queryFn: fetchEquipment,
    enabled: !!db,
  });

  const { data: technicians = [], isLoading: isLoadingTechnicians } = useQuery<Technician[], Error>({
    queryKey: [FIRESTORE_TECHNICIAN_COLLECTION_NAME],
    queryFn: fetchTechnicians,
    enabled: !!db,
  });

  const { data: vehicles = [], isLoading: isLoadingVehicles } = useQuery<Vehicle[], Error>({
    queryKey: [FIRESTORE_VEHICLE_COLLECTION_NAME],
    queryFn: fetchVehicles,
    enabled: !!db,
  });

  const { data: goldmaqCompanyDetails, isLoading: isLoadingGoldmaqCompany } = useQuery<Company | null, Error>({
      queryKey: [FIRESTORE_COMPANY_COLLECTION_NAME, GOLDMAQ_COMPANY_ID],
      queryFn: () => fetchCompanyById(GOLDMAQ_COMPANY_ID),
      enabled: !!db,
  });


  const getCustomerDetails = useCallback((id: string): Customer | undefined => {
    return (customers || []).find(c => c.id === id);
  }, [customers]);

  const getEquipmentDetails = useCallback((id: string): Maquina | undefined => {
    return (equipmentList || []).find(e => e.id === id);
  }, [equipmentList]);

  const getTechnicianName = useCallback((id?: string | null) => {
    if (!id) return "Não Atribuído";
    return (technicians || []).find(t => t.id === id)?.name || id;
  }, [technicians]);

  const filteredServiceOrders = useMemo(() => {
    let tempOrders = serviceOrdersRaw;

    if (selectedPhaseFilter !== "Todos") {
      tempOrders = tempOrders.filter(order => order.phase === selectedPhaseFilter);
    }

    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      tempOrders = tempOrders.filter(order => {
        const customer = getCustomerDetails(order.customerId);
        const equipment = getEquipmentDetails(order.equipmentId);
        const technicianName = getTechnicianName(order.technicianId);

        return (
          order.orderNumber.toLowerCase().includes(lowerSearchTerm) ||
          (customer?.name.toLowerCase().includes(lowerSearchTerm)) ||
          (equipment?.brand.toLowerCase().includes(lowerSearchTerm)) ||
          (equipment?.model.toLowerCase().includes(lowerSearchTerm)) ||
          (equipment?.chassisNumber.toLowerCase().includes(lowerSearchTerm)) ||
          (technicianName && technicianName !== "Não Atribuído" && technicianName.toLowerCase().includes(lowerSearchTerm)) ||
          (order.requesterName && order.requesterName.toLowerCase().includes(lowerSearchTerm)) ||
          order.serviceType.toLowerCase().includes(lowerSearchTerm) ||
          (order.customServiceType && order.customServiceType.toLowerCase().includes(lowerSearchTerm)) ||
          order.description.toLowerCase().includes(lowerSearchTerm)
        );
      });
    }
    return tempOrders;
  }, [serviceOrdersRaw, selectedPhaseFilter, searchTerm, getCustomerDetails, getEquipmentDetails, getTechnicianName]);


  useEffect(() => {
    if (formVehicleId && typeof formEstimatedTravelDistanceKm === 'number') {
      const vehicle = (vehicles || []).find(v => v.id === formVehicleId);
      if (vehicle && typeof vehicle.costPerKilometer === 'number') {
        const fuelCost = formEstimatedTravelDistanceKm * vehicle.costPerKilometer;
        const totalTolls = typeof formEstimatedTollCosts === 'number' ? formEstimatedTollCosts : 0;
        form.setValue('estimatedTravelCost', parseFloat((fuelCost + totalTolls).toFixed(2)));
      } else {
        form.setValue('estimatedTravelCost', typeof formEstimatedTollCosts === 'number' ? formEstimatedTollCosts : null);
      }
    } else if (typeof formEstimatedTollCosts === 'number') {
      form.setValue('estimatedTravelCost', formEstimatedTollCosts);
    }
     else {
      form.setValue('estimatedTravelCost', null);
    }
  }, [formVehicleId, formEstimatedTravelDistanceKm, formEstimatedTollCosts, vehicles, form]);

  useEffect(() => {
    const attemptCalculateDistanceAndTolls = async () => {
      const currentDistanceValue = form.getValues("estimatedTravelDistanceKm");
      const currentTollValue = form.getValues("estimatedTollCosts");

      if (
        isModalOpen &&
        (!editingOrder || (editingOrder && isEditMode)) &&
        selectedCustomerId &&
        formEquipmentId && formEquipmentId !== NO_EQUIPMENT_SELECTED_VALUE &&
        !isCalculatingDistance &&
        typeof calculateDistance === 'function'
      ) {
        const customer = (customers || []).find(c => c.id === selectedCustomerId);
        const equipment = (equipmentList || []).find(e => e.id === formEquipmentId);

        if (!customer || !equipment || !equipment.ownerReference || companyIds.indexOf(equipment.ownerReference as CompanyId) === -1) {
          return;
        }

        const companyOwnerId = equipment.ownerReference as CompanyId;
        const originCompany = goldmaqCompanyDetails;

        if (!originCompany || !originCompany.street || !originCompany.city || !originCompany.state || !originCompany.cep ||
            !customer.street || !customer.city || !customer.state || !customer.cep) {
          console.warn("[OS ClientPage] Missing address details for origin company or destination customer. Automatic calculation skipped.");
          return;
        }

        const originAddress = formatAddressToString(originCompany);
        const destinationAddress = formatAddressToString(customer);

        if (!originAddress || !destinationAddress) {
            console.warn("[OS ClientPage] Could not format origin or destination address strings. Automatic calculation skipped.");
            return;
        }

        if (currentDistanceValue !== null && currentDistanceValue !== undefined) {
            return;
        }

        setIsCalculatingDistance(true);
        try {
          const result: CalculateDistanceOutput = await calculateDistance({ originAddress, destinationAddress });

          let toastMessage = "";
          if (result.status === 'SIMULATED' || result.status === 'SUCCESS') {
            const roundTripDistance = parseFloat((result.distanceKm * 2).toFixed(1));
            form.setValue('estimatedTravelDistanceKm', roundTripDistance, { shouldValidate: true });
            toastMessage += `Distância (ida/volta): ${roundTripDistance} km (${result.status === 'SIMULATED' ? 'Simulado' : 'Calculado'}).`;

            if ((currentTollValue === null || currentTollValue === undefined) &&
                result.estimatedTollCostByAI && result.estimatedTollCostByAI > 0) {
              const roundTripTollAI = parseFloat((result.estimatedTollCostByAI * 2).toFixed(2));
              form.setValue('estimatedTollCosts', roundTripTollAI, { shouldValidate: true });
              toastMessage += ` Pedágio (est. IA): R$ ${roundTripTollAI}.`;
            } else if (result.estimatedTollCostByAI === 0) {
              toastMessage += ` Estimativa de pedágio pela IA: R$ 0.00.`;
            }
            toast({ title: "Estimativas Calculadas", description: toastMessage.trim() });

          } else {
            toast({ title: "Falha ao Calcular Distância", description: result.errorMessage || "Não foi possível calcular a distância automaticamente.", variant: "default" });
          }
        } catch (e: any) {
          console.error("[OS ClientPage] Error calling calculateDistance flow:", e);
          toast({ title: "Erro no Cálculo de Distância", description: e.message || "Ocorreu um erro ao tentar calcular a distância.", variant: "destructive" });
        } finally {
          setIsCalculatingDistance(false);
        }
      }
    };

    if (isModalOpen && (!editingOrder || (editingOrder && isEditMode)) && !isCalculatingDistance && goldmaqCompanyDetails) {
        attemptCalculateDistanceAndTolls().catch(err => {
            console.error("[OS ClientPage] Error in attemptCalculateDistanceAndTolls useEffect:", err);
            setIsCalculatingDistance(false);
        });
    }
  }, [
    isModalOpen, editingOrder, isEditMode, selectedCustomerId, formEquipmentId,
    isCalculatingDistance, customers, equipmentList, goldmaqCompanyDetails, form, toast
  ]);


  if (!db || !storage) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <PageHeader title="Erro de Conexão" />
        <p className="text-lg text-center text-muted-foreground">
          Não foi possível conectar aos serviços do Firebase.
          <br />
          Verifique a configuração e sua conexão com a internet.
        </p>
      </div>
    );
  }

  const filteredEquipmentList = useMemo(() => {
    if (isLoadingEquipment) return [];
    if (selectedCustomerId) {
      return equipmentList.filter(eq =>
        eq.customerId === selectedCustomerId ||
        (eq.ownerReference && companyIds.includes(eq.ownerReference as CompanyId) && (eq.operationalStatus === "Disponível" || eq.operationalStatus === "Em Manutenção"))
      );
    }
    return equipmentList.filter(eq =>
      eq.ownerReference && companyIds.includes(eq.ownerReference as CompanyId) && (eq.operationalStatus === "Disponível" || eq.operationalStatus === "Em Manutenção")
    );
  }, [equipmentList, selectedCustomerId, isLoadingEquipment]);

  useEffect(() => {
    if (!editingOrder) {
        if (selectedCustomerId) {
            const customer = (customers || []).find(c => c.id === selectedCustomerId);
            if (customer?.preferredTechnician) {
                const preferredTech = (technicians || []).find(t => t.name === customer.preferredTechnician);
                form.setValue('technicianId', preferredTech ? preferredTech.id : null, { shouldValidate: true });
            } else {
                form.setValue('technicianId', null, { shouldValidate: true });
            }
        } else {
             form.setValue('technicianId', null, { shouldValidate: true });
        }
    }

    if (selectedCustomerId) {
      if (formEquipmentId && !filteredEquipmentList.find(eq => eq.id === formEquipmentId)) {
        form.setValue('equipmentId', NO_EQUIPMENT_SELECTED_VALUE, { shouldValidate: true });
      }
    } else {
       if (formEquipmentId && !filteredEquipmentList.find(eq => eq.id === formEquipmentId)) {
        form.setValue('equipmentId', NO_EQUIPMENT_SELECTED_VALUE, { shouldValidate: true });
      }
    }
  }, [selectedCustomerId, customers, technicians, form, editingOrder, filteredEquipmentList, formEquipmentId]);


  const prepareDataForFirestore = (
    formData: z.infer<typeof ServiceOrderSchema>,
    processedMediaUrls?: (string | null)[] | null

  ): Omit<ServiceOrder, 'id' | 'customServiceType' | 'startDate' | 'endDate' | 'mediaUrls'> & { startDate: Timestamp | null; endDate: Timestamp | null; mediaUrls: string[] | null } => {
    const { customServiceType, mediaUrls: formMediaUrlsIgnored, ...restOfData } = formData;

    let finalServiceType = restOfData.serviceType;
    if (restOfData.serviceType === CUSTOM_SERVICE_TYPE_VALUE) {
      finalServiceType = customServiceType || "Não especificado";
    }

    const validProcessedUrls = processedMediaUrls?.filter(url => typeof url === 'string') as string[] | undefined;

    return {
      orderNumber: restOfData.orderNumber,
      customerId: restOfData.customerId,
      equipmentId: restOfData.equipmentId,
      requesterName: (restOfData.requesterName === undefined || restOfData.requesterName === null || restOfData.requesterName.trim() === "") ? null : restOfData.requesterName,
      phase: restOfData.phase,
      description: restOfData.description,
      serviceType: finalServiceType,
      startDate: convertToTimestamp(restOfData.startDate),
      endDate: convertToTimestamp(restOfData.endDate),
      vehicleId: restOfData.vehicleId || null,
      technicianId: restOfData.technicianId || null,
      mediaUrls: validProcessedUrls && validProcessedUrls.length > 0 ? validProcessedUrls : null,
      technicalConclusion: restOfData.technicalConclusion || null,
      notes: (restOfData.notes === undefined || restOfData.notes === null || restOfData.notes.trim() === "") ? null : restOfData.notes,
      estimatedTravelDistanceKm: restOfData.estimatedTravelDistanceKm !== undefined && restOfData.estimatedTravelDistanceKm !== null ? Number(restOfData.estimatedTravelDistanceKm) : null,
      estimatedTollCosts: restOfData.estimatedTollCosts !== undefined && restOfData.estimatedTollCosts !== null ? Number(restOfData.estimatedTollCosts) : null,
      estimatedTravelCost: restOfData.estimatedTravelCost !== undefined && restOfData.estimatedTravelCost !== null ? Number(restOfData.estimatedTravelCost) : null,
    };
  };


  const addServiceOrderMutation = useMutation({
    mutationFn: async (data: { formData: z.infer<typeof ServiceOrderSchema>; filesToUpload: File[] }) => {
      if (!db) throw new Error("Firebase DB is not available for adding service order.");
      setIsUploadingFile(true);
      const newOrderId = doc(collection(db, FIRESTORE_COLLECTION_NAME)).id;
      const uploadedUrls: string[] = [];

      if (data.filesToUpload && data.filesToUpload.length > 0) {
        for (const file of data.filesToUpload) {
          const url = await uploadServiceOrderFile(file, newOrderId);
          uploadedUrls.push(url);
        }
      }
      const orderDataForFirestore = prepareDataForFirestore(data.formData, uploadedUrls);
      await setDoc(doc(db, FIRESTORE_COLLECTION_NAME, newOrderId), orderDataForFirestore);
      return { ...orderDataForFirestore, id: newOrderId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Ordem de Serviço Criada", description: `Ordem ${data.orderNumber} criada.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Criar OS", description: `Não foi possível criar a OS ${variables.formData.orderNumber}. Detalhe: ${err.message}`, variant: "destructive" });
    },
    onSettled: () => setIsUploadingFile(false)
  });

 const updateServiceOrderMutation = useMutation({
    mutationFn: async (data: {
      id: string,
      formData: z.infer<typeof ServiceOrderSchema>,
      filesToUpload: File[],
      existingUrlsToKeep: string[],
      originalMediaUrls: string[]
    }) => {
      if (!db || !storage) {
        throw new Error("Firebase Firestore ou Storage connection not available.");
      }
      setIsUploadingFile(true);

      let finalMediaUrls: string[] = [...data.existingUrlsToKeep];

      if (data.filesToUpload && data.filesToUpload.length > 0) {
        for (const file of data.filesToUpload) {
          const url = await uploadServiceOrderFile(file, data.id);
          finalMediaUrls.push(url);
        }
      }

      const urlsToDelete = data.originalMediaUrls.filter(url => !data.existingUrlsToKeep.includes(url));
      for (const urlToDelete of urlsToDelete) {
        await deleteServiceOrderFileFromStorage(urlToDelete);
      }

      const orderDataForFirestore = prepareDataForFirestore(data.formData, finalMediaUrls);
      const orderRef = doc(db, FIRESTORE_COLLECTION_NAME, data.id);
      await updateDoc(orderRef, orderDataForFirestore as { [x: string]: any });
      return { ...orderDataForFirestore, id: data.id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Ordem de Serviço Atualizada", description: `Ordem ${data.orderNumber} atualizada.` });
      closeModal();
    },
    onError: (err: Error, variables) => {
      toast({ title: "Erro ao Atualizar OS", description: `Não foi possível atualizar a OS ${variables.formData.orderNumber}. Detalhe: ${err.message}`, variant: "destructive" });
    },
    onSettled: () => setIsUploadingFile(false),
  });

  const deleteServiceOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (!db) throw new Error("Firebase DB is not available for deleting service order.");
      const orderToDelete = serviceOrdersRaw.find(o => o.id === orderId);
      if (orderToDelete?.mediaUrls && orderToDelete.mediaUrls.length > 0) {
        for (const url of orderToDelete.mediaUrls) {
          await deleteServiceOrderFileFromStorage(url);
        }
      }
      return deleteDoc(doc(db, FIRESTORE_COLLECTION_NAME, orderId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Ordem de Serviço Excluída" });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Excluir OS", description: err.message, variant: "destructive" });
    },
  });

  const openModal = useCallback((order?: ServiceOrder) => {
    if (order) {
      setEditingOrder(order);
      setIsEditMode(false);
      form.reset({
        ...order,
        requesterName: order.requesterName || "",
        technicianId: order.technicianId || null,
        vehicleId: order.vehicleId || null,
        startDate: order.startDate ? formatDateForInput(order.startDate) : undefined,
        endDate: order.endDate ? formatDateForInput(order.endDate) : undefined,
        mediaUrls: order.mediaUrls || [],
        technicalConclusion: order.technicalConclusion || null,
        notes: order.notes || "",
        customServiceType: order.serviceType && !serviceTypeOptionsList.includes(order.serviceType as any) ? order.serviceType : "",
        serviceType: order.serviceType && serviceTypeOptionsList.includes(order.serviceType as any) ? order.serviceType : CUSTOM_SERVICE_TYPE_VALUE,
        estimatedTravelDistanceKm: order.estimatedTravelDistanceKm !== undefined ? order.estimatedTravelDistanceKm : null,
        estimatedTollCosts: order.estimatedTollCosts !== undefined ? order.estimatedTollCosts : null,
        estimatedTravelCost: order.estimatedTravelCost !== undefined ? order.estimatedTravelCost : null,
      });
      setShowCustomServiceType(order.serviceType && !serviceTypeOptionsList.includes(order.serviceType as any));
    } else {
      setEditingOrder(null);
      setIsEditMode(true);
      form.reset({
        orderNumber: getNextOrderNumber(serviceOrdersRaw),
        customerId: "", equipmentId: NO_EQUIPMENT_SELECTED_VALUE, phase: "Aguardando Avaliação Técnica",
        technicianId: null, requesterName: "", serviceType: "", customServiceType: "",
        vehicleId: null, description: "", notes: "",
        startDate: formatDateForInput(new Date().toISOString()), endDate: "",
        mediaUrls: [], technicalConclusion: null,
        estimatedTravelDistanceKm: null, estimatedTollCosts: null, estimatedTravelCost: null,
      });
      setShowCustomServiceType(false);
    }
    setMediaFiles([]);
    setIsModalOpen(true);
  }, [form, serviceOrdersRaw]);


  const handleOpenConclusionModal = (orderToConclude: ServiceOrder) => {
    setEditingOrder(orderToConclude);
    setTechnicalConclusionText(orderToConclude.technicalConclusion || "");
    setIsConclusionModalOpen(true);
  };

  const handleConfirmConclusion = async () => {
    if (!editingOrder || !editingOrder.id) return;
    const orderRef = doc(db!, FIRESTORE_COLLECTION_NAME, editingOrder.id);
    try {
      await updateDoc(orderRef, {
        phase: 'Concluída',
        technicalConclusion: technicalConclusionText.trim() || "Serviço concluído conforme solicitado.",
        endDate: Timestamp.fromDate(new Date()),
      });
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Ordem de Serviço Concluída", description: `OS ${editingOrder.orderNumber} marcada como concluída.` });
      setIsConclusionModalOpen(false);
      setEditingOrder(null);
      setTechnicalConclusionText("");
    } catch (e: any) {
      toast({ title: "Erro ao Concluir OS", description: e.message, variant: "destructive" });
    }
  };

  const handleOpenCancelModal = (orderToCancel: ServiceOrder) => {
    setEditingOrder(orderToCancel);
    setIsCancelConfirmModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!editingOrder || !editingOrder.id) return;
    const orderRef = doc(db!, FIRESTORE_COLLECTION_NAME, editingOrder.id);
    try {
      await updateDoc(orderRef, {
        phase: 'Cancelada',
        endDate: Timestamp.fromDate(new Date()),
      });
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Ordem de Serviço Cancelada", description: `OS ${editingOrder.orderNumber} marcada como cancelada.` });
      setIsCancelConfirmModalOpen(false);
      setEditingOrder(null);
    } catch (e: any) {
      toast({ title: "Erro ao Cancelar OS", description: e.message, variant: "destructive" });
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setIsEditMode(false);
    form.reset();
    setMediaFiles([]);
  };

  const onSubmit = (values: z.infer<typeof ServiceOrderSchema>) => {
    const existingUrlsToKeep = editingOrder?.mediaUrls || [];
    if (editingOrder && editingOrder.id) {
      updateServiceOrderMutation.mutate({
        id: editingOrder.id,
        formData: values,
        filesToUpload: mediaFiles,
        existingUrlsToKeep,
        originalMediaUrls: editingOrder.mediaUrls || [],
      });
    } else {
      addServiceOrderMutation.mutate({ formData: values, filesToUpload: mediaFiles });
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingOrder && editingOrder.id) {
      if (window.confirm(`Tem certeza que deseja excluir a Ordem de Serviço "${editingOrder.orderNumber}"? Esta ação não pode ser desfeita.`)) {
        deleteServiceOrderMutation.mutate(editingOrder.id);
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const currentTotalFiles = (formMediaUrls?.length || 0) + mediaFiles.length;
      const newFilesArray = Array.from(event.target.files);
      if (currentTotalFiles + newFilesArray.length > MAX_FILES_ALLOWED) {
        toast({
          title: "Limite de Arquivos Excedido",
          description: `Você pode anexar no máximo ${MAX_FILES_ALLOWED} arquivos no total.`,
          variant: "destructive",
        });
        return;
      }
      setMediaFiles(prev => [...prev, ...newFilesArray]);
    }
  };

  const handleRemoveNewFile = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingUrl = (urlToRemove: string) => {
    const currentUrls = form.getValues('mediaUrls') || [];
    form.setValue('mediaUrls', currentUrls.filter(url => url !== urlToRemove), { shouldDirty: true });
    if(editingOrder && editingOrder.mediaUrls){
      setEditingOrder(prev => prev ? ({...prev, mediaUrls: prev.mediaUrls?.filter(url => url !== urlToRemove) || []}) : null);
    }
  };

  const handleServiceTypeChange = (value: string) => {
    form.setValue('serviceType', value);
    setShowCustomServiceType(value === CUSTOM_SERVICE_TYPE_VALUE);
    if (value !== CUSTOM_SERVICE_TYPE_VALUE) {
        form.setValue('customServiceType', "");
    }
  };

  const generateTechnicianOsPDF = (
    order: ServiceOrder,
    customer: Customer | undefined,
    equipment: Maquina | undefined,
    technicianName: string,
    companyDetails: Company | null
  ) => {
    if (!order) return;
    const doc = new jsPDF();
    let yPos = 15;
    const lineSpacing = 7;
    const smallText = 9;
    const normalText = 10;
    const largeText = 12;
    const titleText = 16;

    // Header - Company Details
    if (companyDetails) {
      doc.setFontSize(largeText);
      doc.setFont("helvetica", "bold");
      doc.text(companyDetails.name, 14, yPos);
      yPos += lineSpacing;
      doc.setFontSize(smallText);
      doc.setFont("helvetica", "normal");
      doc.text(`CNPJ: ${companyDetails.cnpj}`, 14, yPos);
      yPos += lineSpacing / 1.5;
      doc.text(formatAddressForDisplay(companyDetails), 14, yPos);
      yPos += lineSpacing;
    } else {
      doc.setFontSize(largeText);
      doc.setFont("helvetica", "bold");
      doc.text("Gold Maq Empilhadeiras", 14, yPos);
      yPos += lineSpacing * 1.5;
    }

    // Title
    doc.setFontSize(titleText);
    doc.setFont("helvetica", "bold");
    doc.text(`ORDEM DE SERVIÇO Nº ${order.orderNumber}`, 105, yPos, { align: "center" });
    yPos += lineSpacing * 1.5;

    // Basic Info
    doc.setFontSize(normalText);
    doc.setFont("helvetica", "bold");
    doc.text("INFORMAÇÕES GERAIS", 14, yPos);
    yPos += lineSpacing;
    doc.setFont("helvetica", "normal");
    doc.text(`Data Abertura: ${order.startDate ? formatDateForDisplay(order.startDate) : 'N/A'}`, 14, yPos);
    doc.text(`Técnico: ${technicianName || 'N/A'}`, 100, yPos);
    yPos += lineSpacing;
    doc.text(`Previsão Conclusão: ${order.endDate ? formatDateForDisplay(order.endDate) : 'N/A'}`, 14, yPos);
    yPos += lineSpacing * 1.5;

    // Customer Info
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO CLIENTE", 14, yPos);
    yPos += lineSpacing;
    doc.setFont("helvetica", "normal");
    if (customer) {
      doc.text(`Nome/Razão Social: ${toTitleCase(customer.name)}`, 14, yPos);
      yPos += lineSpacing;
      doc.text(`CNPJ: ${customer.cnpj}`, 14, yPos);
      doc.text(`Solicitante: ${toTitleCase(order.requesterName) || 'N/A'}`, 100, yPos);
      yPos += lineSpacing;
      doc.text(`Telefone: ${customer.phone ? formatPhoneNumberForInputDisplay(customer.phone) : 'N/A'}`, 14, yPos);
      yPos += lineSpacing;
      doc.text(`Endereço: ${formatAddressForDisplay(customer)}`, 14, yPos);
      yPos += lineSpacing * 1.5;
    } else {
      doc.text("Cliente não especificado.", 14, yPos);
      yPos += lineSpacing * 1.5;
    }

    // Equipment Info
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO EQUIPAMENTO", 14, yPos);
    yPos += lineSpacing;
    doc.setFont("helvetica", "normal");
    if (equipment) {
      doc.text(`Marca/Modelo: ${toTitleCase(equipment.brand)} ${toTitleCase(equipment.model)}`, 14, yPos);
      yPos += lineSpacing;
      doc.text(`Chassi: ${equipment.chassisNumber || 'N/A'}`, 14, yPos);
      doc.text(`Ano: ${equipment.manufactureYear || 'N/A'}`, 100, yPos);
      yPos += lineSpacing;
      doc.text(`Tipo: ${equipment.equipmentType}`, 14, yPos);
      yPos += lineSpacing * 1.5;
    } else {
      doc.text("Equipamento não especificado.", 14, yPos);
      yPos += lineSpacing * 1.5;
    }

    // Service Details
    doc.setFont("helvetica", "bold");
    doc.text("DETALHES DO SERVIÇO", 14, yPos);
    yPos += lineSpacing;
    doc.setFont("helvetica", "normal");
    doc.text(`Tipo de Serviço: ${order.serviceType || 'N/A'}`, 14, yPos);
    yPos += lineSpacing;
    doc.text("Problema Relatado:", 14, yPos);
    yPos += lineSpacing * 0.8;
    const problemLines = doc.splitTextToSize(order.description || "Nenhum problema relatado.", 180);
    doc.text(problemLines, 14, yPos);
    yPos += (problemLines.length * lineSpacing * 0.7) + lineSpacing;

    // Notes and Conclusion Area
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVAÇÕES / DIAGNÓSTICO TÉCNICO:", 14, yPos);
    yPos += lineSpacing;
    doc.rect(14, yPos, 182, 30); // Box for notes
    yPos += 30 + lineSpacing;

    doc.setFont("helvetica", "bold");
    doc.text("SERVIÇOS REALIZADOS / PEÇAS UTILIZADAS:", 14, yPos);
    yPos += lineSpacing;
    doc.rect(14, yPos, 182, 30); // Box for services/parts
    yPos += 30 + lineSpacing * 1.5;

    // Signatures
    doc.line(14, yPos, 84, yPos); // Technician signature line
    doc.text("Assinatura do Técnico", 14, yPos + 5);
    doc.line(112, yPos, 182, yPos); // Customer signature line
    doc.text("Assinatura do Cliente", 112, yPos + 5);
    yPos += lineSpacing * 1.5;

    // Footer
    doc.setFontSize(smallText - 1);
    doc.text(`Documento gerado em: ${formatDateForDisplay(new Date().toISOString())}`, 14, doc.internal.pageSize.height - 10);

    doc.save(`OS_Tecnico_${order.orderNumber}.pdf`);
  };

  const generateCustomerReceiptPDF = (
    order: ServiceOrder,
    customer: Customer | undefined,
    equipment: Maquina | undefined,
    companyDetails: Company | null
  ) => {
    if (!order) return;
    const doc = new jsPDF();
    let yPos = 15;
    const lineSpacing = 7;
    const smallText = 9;
    const normalText = 10;
    const largeText = 12;
    const titleText = 16;

    // Header
    if (companyDetails) {
      doc.setFontSize(largeText);
      doc.setFont("helvetica", "bold");
      doc.text(companyDetails.name, 14, yPos);
      yPos += lineSpacing;
      doc.setFontSize(smallText);
      doc.setFont("helvetica", "normal");
      doc.text(`CNPJ: ${companyDetails.cnpj}`, 14, yPos);
      yPos += lineSpacing / 1.5;
      doc.text(formatAddressForDisplay(companyDetails), 14, yPos);
      yPos += lineSpacing;
    } else {
      doc.setFontSize(largeText);
      doc.setFont("helvetica", "bold");
      doc.text("Gold Maq Empilhadeiras", 14, yPos);
      yPos += lineSpacing * 1.5;
    }

    // Title
    doc.setFontSize(titleText);
    doc.setFont("helvetica", "bold");
    doc.text(`RECIBO DE SERVIÇO - OS Nº ${order.orderNumber}`, 105, yPos, { align: "center" });
    yPos += lineSpacing * 1.5;

    // Dates
    doc.setFontSize(normalText);
    doc.setFont("helvetica", "normal");
    doc.text(`Data Abertura: ${order.startDate ? formatDateForDisplay(order.startDate) : 'N/A'}`, 14, yPos);
    doc.text(`Data Conclusão: ${order.endDate ? formatDateForDisplay(order.endDate) : 'N/A'}`, 100, yPos);
    yPos += lineSpacing * 1.5;

    // Customer
    doc.setFont("helvetica", "bold");
    doc.text("CLIENTE", 14, yPos);
    yPos += lineSpacing;
    doc.setFont("helvetica", "normal");
    if (customer) {
      doc.text(`Nome/Razão Social: ${toTitleCase(customer.name)}`, 14, yPos);
      yPos += lineSpacing;
      doc.text(`CNPJ: ${customer.cnpj}`, 14, yPos);
      yPos += lineSpacing;
      doc.text(`Endereço: ${formatAddressForDisplay(customer)}`, 14, yPos);
      yPos += lineSpacing * 1.5;
    }

    // Equipment
    doc.setFont("helvetica", "bold");
    doc.text("EQUIPAMENTO", 14, yPos);
    yPos += lineSpacing;
    doc.setFont("helvetica", "normal");
    if (equipment) {
      doc.text(`Marca/Modelo: ${toTitleCase(equipment.brand)} ${toTitleCase(equipment.model)}`, 14, yPos);
      yPos += lineSpacing;
      doc.text(`Chassi: ${equipment.chassisNumber || 'N/A'}`, 14, yPos);
      yPos += lineSpacing * 1.5;
    }

    // Service Details
    doc.setFont("helvetica", "bold");
    doc.text("SERVIÇO REALIZADO", 14, yPos);
    yPos += lineSpacing;
    doc.setFont("helvetica", "normal");
    doc.text(`Tipo de Serviço: ${order.serviceType || 'N/A'}`, 14, yPos);
    yPos += lineSpacing;
    doc.text("Problema Relatado:", 14, yPos);
    yPos += lineSpacing * 0.8;
    const problemLines = doc.splitTextToSize(order.description || "N/A", 180);
    doc.text(problemLines, 14, yPos);
    yPos += (problemLines.length * lineSpacing * 0.7) + lineSpacing;

    doc.text("Conclusão Técnica / Solução:", 14, yPos);
    yPos += lineSpacing * 0.8;
    const conclusionLines = doc.splitTextToSize(order.technicalConclusion || "Serviço concluído.", 180);
    doc.text(conclusionLines, 14, yPos);
    yPos += (conclusionLines.length * lineSpacing * 0.7) + lineSpacing * 2;


    // Signature placeholder
    doc.line(14, yPos, 84, yPos);
    doc.text("Assinatura do Cliente", 14, yPos + 5);
    yPos += lineSpacing * 1.5;

    doc.setFontSize(smallText - 1);
    doc.text(`Documento gerado em: ${formatDateForDisplay(new Date().toISOString())}`, 14, doc.internal.pageSize.height - 10);
    doc.save(`Recibo_OS_${order.orderNumber}.pdf`);
  };

  const handlePrintForTechnician = (order: ServiceOrder) => {
    if (isLoadingGoldmaqCompany) {
      toast({ title: "Aguarde", description: "Carregando dados da empresa..."});
      return;
    }
    const customer = getCustomerDetails(order.customerId);
    const equipment = getEquipmentDetails(order.equipmentId);
    const technicianName = getTechnicianName(order.technicianId);
    generateTechnicianOsPDF(order, customer, equipment, technicianName, goldmaqCompanyDetails);
  };

  const handlePrintForCustomer = (order: ServiceOrder) => {
     if (isLoadingGoldmaqCompany) {
      toast({ title: "Aguarde", description: "Carregando dados da empresa..."});
      return;
    }
    const customer = getCustomerDetails(order.customerId);
    const equipment = getEquipmentDetails(order.equipmentId);
    generateCustomerReceiptPDF(order, customer, equipment, goldmaqCompanyDetails);
  };


  useEffect(() => {
    if (serviceOrderIdFromUrl && !isLoadingServiceOrders && serviceOrdersRaw.length > 0 && !isModalOpen) {
      const orderToOpen = serviceOrdersRaw.find(o => o.id === serviceOrderIdFromUrl);
      if (orderToOpen) {
        openModal(orderToOpen);
         if (typeof window !== "undefined") {
           window.history.replaceState(null, '', '/service-orders');
        }
      }
    }
  }, [serviceOrderIdFromUrl, serviceOrdersRaw, isLoadingServiceOrders, openModal, isModalOpen]);


  const isLoadingPageData = isLoadingServiceOrders || isLoadingCustomers || isLoadingEquipment || isLoadingTechnicians || isLoadingVehicles || isLoadingGoldmaqCompany;
  const isMutating = addServiceOrderMutation.isPending || updateServiceOrderMutation.isPending || deleteServiceOrderMutation.isPending || isUploadingFile;

  if (isLoadingPageData && !isModalOpen && !isConclusionModalOpen && !isCancelConfirmModalOpen) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Carregando Ordens de Serviço...</p>
      </div>
    );
  }

  if (isErrorServiceOrders) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertIconLI className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Ordens de Serviço</h2>
        <p className="text-center">Não foi possível buscar os dados. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: {errorServiceOrdersData?.message}</p>
      </div>
    );
  }


  return (
    <TooltipProvider>
      <PageHeader
        title="Ordens de Serviço"
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nova OS
          </Button>
        }
      />

      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por OS, cliente, máquina, técnico..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10"
          />
        </div>
        <div className="relative md:w-auto">
          <Select
            value={selectedPhaseFilter}
            onValueChange={(value) => setSelectedPhaseFilter(value as ServiceOrderPhaseType | "Todos")}
          >
            <SelectTrigger className="w-full md:w-[280px]">
              <SelectValue placeholder="Filtrar por fase..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todas as Fases</SelectItem>
              {serviceOrderPhaseOptions.map(phase => (
                <SelectItem key={phase} value={phase}>{phase}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {serviceOrdersRaw.length === 0 && !isLoadingServiceOrders && selectedPhaseFilter === "Todos" && !searchTerm.trim() ? (
        <DataTablePlaceholder
          icon={ClipboardList}
          title="Nenhuma Ordem de Serviço Registrada"
          description="Crie sua primeira ordem de serviço para começar."
          buttonLabel="Nova OS"
          onButtonClick={() => openModal()}
        />
      ) : filteredServiceOrders.length === 0 ? (
        <div className="text-center py-10">
          <SearchIcon className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-lg font-semibold">Nenhuma OS Encontrada</h3>
          <p className="text-sm text-muted-foreground">
            Sua busca ou filtro não retornou resultados. Tente um termo diferente ou ajuste os filtros.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServiceOrders.map((order) => {
            const customer = getCustomerDetails(order.customerId);
            const equipment = getEquipmentDetails(order.equipmentId);
            const technicianName = getTechnicianName(order.technicianId);
            const PhaseIcon = phaseIcons[order.phase] || ClipboardList;
            const deadlineInfo = getDeadlineStatusInfo(order.endDate, order.phase);
            const whatsappNumber = getWhatsAppNumber(customer?.phone);
            const whatsappLink = whatsappNumber && customer
              ? `https://wa.me/${whatsappNumber}?text=Ol%C3%A1%20${encodeURIComponent(toTitleCase(customer.name))},%20sobre%20a%20OS%20${order.orderNumber}...`
              : "#";
            const isOrderConcludedOrCancelled = order.phase === 'Concluída' || order.phase === 'Cancelada';


            return (
              <Card key={order.id} className={cn("flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300", deadlineInfo.alertClass)}>
                <div onClick={() => openModal(order)} className="cursor-pointer flex-grow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="font-headline text-xl text-primary">OS: {order.orderNumber}</CardTitle>
                      <div className="flex items-center gap-2">
                        {deadlineInfo.icon && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="p-0 border-0 bg-transparent cursor-help">{deadlineInfo.icon}</button>
                            </TooltipTrigger>
                            <TooltipContent><p>{deadlineInfo.message}</p></TooltipContent>
                          </Tooltip>
                        )}
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", {
                          "bg-yellow-100 text-yellow-700": order.phase === "Aguardando Avaliação Técnica" || order.phase === "Autorizado, Aguardando Peça",
                          "bg-purple-100 text-purple-700": order.phase === "Avaliado, Aguardando Autorização",
                          "bg-blue-100 text-blue-700": order.phase === "Em Execução",
                          "bg-green-100 text-green-700": order.phase === "Concluída",
                          "bg-red-100 text-red-700": order.phase === "Cancelada",
                        })}>
                          {order.phase}
                        </span>
                      </div>
                    </div>
                     <CardDescription>
                      Cliente: {isLoadingCustomers ? "Carregando..." : (customer?.name ? toTitleCase(customer.name) : 'N/A')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow space-y-2 text-sm">
                    {isLoadingEquipment ? (
                      <p className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando equipamento...</p>
                    ) : equipment ? (
                      <>
                        <p className="flex items-center">
                          <Layers className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                          <span className="font-medium text-muted-foreground mr-1">Máquina:</span>
                          {toTitleCase(equipment.brand)} {toTitleCase(equipment.model)}
                        </p>
                        <p className="flex items-center">
                          <Tag className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                          <span className="font-medium text-muted-foreground mr-1">Chassi:</span>
                          {equipment.chassisNumber || "N/A"}
                        </p>
                         {equipment.manufactureYear && (
                          <p className="flex items-center">
                            <CalendarIconDetails className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium text-muted-foreground mr-1">Ano:</span>
                            {equipment.manufactureYear}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="flex items-center text-muted-foreground"><Construction className="mr-2 h-4 w-4" /> Equipamento não encontrado</p>
                    )}

                    <p className="flex items-center">
                      <Settings2 className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Tipo Serviço:</span> {order.serviceType}
                    </p>
                    <p className="flex items-center">
                      <User className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Solicitante:</span> {order.requesterName || 'N/A'}
                    </p>
                    <p className="flex items-center">
                      <HardHat className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Técnico:</span>
                      {isLoadingTechnicians ? "Carregando..." : technicianName}
                    </p>
                    <p className="flex items-center">
                      <Calendar className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Abertura:</span>
                      {order.startDate ? formatDateForDisplay(order.startDate) : 'N/A'}
                    </p>
                    {order.endDate && (
                       <p className="flex items-center">
                        <Calendar className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium text-muted-foreground mr-1">Prev. Conclusão:</span>
                        {formatDateForDisplay(order.endDate)}
                      </p>
                    )}
                    <p className="flex items-start">
                      <FileText className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Problema:</span>
                      <span className="whitespace-pre-wrap break-words">{order.description}</span>
                    </p>
                     {order.notes && (
                      <p className="flex items-start text-xs text-muted-foreground">
                        <FileText className="mr-2 mt-0.5 h-3 w-3 flex-shrink-0" />
                        <span className="font-medium mr-1">Obs OS:</span>
                        <span className="whitespace-pre-wrap break-words">{order.notes}</span>
                      </p>
                    )}
                    {order.technicalConclusion && (
                      <p className="flex items-start text-xs text-muted-foreground">
                        <Check className="mr-2 mt-0.5 h-3 w-3 flex-shrink-0 text-green-600" />
                        <span className="font-medium mr-1">Conclusão Téc.:</span>
                        <span className="whitespace-pre-wrap break-words">{order.technicalConclusion}</span>
                      </p>
                    )}
                  </CardContent>
                </div>
                <CardFooter className="border-t pt-4 flex flex-wrap gap-2 justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handlePrintForTechnician(order);}}
                        disabled={isLoadingGoldmaqCompany || isMutating}
                        className="border-primary text-primary hover:bg-primary/10"
                    >
                        <Printer className="mr-2 h-4 w-4" /> Técnico
                    </Button>
                    {order.phase === 'Concluída' && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handlePrintForCustomer(order);}}
                            disabled={isLoadingGoldmaqCompany || isMutating}
                            className="border-primary text-primary hover:bg-primary/10"
                        >
                            <Printer className="mr-2 h-4 w-4" /> Cliente
                        </Button>
                    )}
                     {!isOrderConcludedOrCancelled && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleOpenConclusionModal(order); }}
                                disabled={isMutating}
                                className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700"
                            >
                                <Check className="mr-2 h-4 w-4" /> Concluir OS
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleOpenCancelModal(order); }}
                                disabled={isMutating}
                                className="border-destructive text-destructive hover:bg-destructive/10"
                            >
                                <X className="mr-2 h-4 w-4" /> Cancelar OS
                            </Button>
                        </>
                    )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingOrder ? `Editar OS: ${editingOrder.orderNumber}` : "Nova Ordem de Serviço"}
        description="Preencha os detalhes da ordem de serviço."
        formId="service-order-form"
        isSubmitting={isMutating}
        editingItem={editingOrder}
        onDeleteConfirm={handleModalDeleteConfirm}
        isDeleting={deleteServiceOrderMutation.isPending}
        deleteButtonLabel="Excluir OS"
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="service-order-form" className="space-y-4">
            <fieldset disabled={!!editingOrder && !isEditMode && !isOrderConcludedOrCancelled} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="orderNumber" render={({ field }) => (
                  <FormItem><FormLabel>Número da OS</FormLabel><FormControl><Input {...field} readOnly className="bg-muted/50" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="customerId" render={({ field }) => (
                  <FormItem><FormLabel>Cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!!editingOrder}>
                      <FormControl><SelectTrigger><SelectValue placeholder={isLoadingCustomers ? "Carregando..." : "Selecione o cliente"} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {customers.map(cust => <SelectItem key={cust.id} value={cust.id}>{cust.name} ({cust.cnpj})</SelectItem>)}
                      </SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="equipmentId" render={({ field }) => (
                <FormItem><FormLabel>Máquina</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={!selectedCustomerId || !!editingOrder}>
                    <FormControl><SelectTrigger><SelectValue placeholder={isLoadingEquipment ? "Carregando..." : (selectedCustomerId ? "Selecione a máquina" : "Selecione um cliente primeiro")} /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NO_EQUIPMENT_SELECTED_VALUE} disabled>
                        {selectedCustomerId ? "Selecione uma máquina" : "Selecione um cliente"}
                      </SelectItem>
                      {filteredEquipmentList.map(eq => <SelectItem key={eq.id} value={eq.id}>{eq.brand} {eq.model} (Chassi: {eq.chassisNumber})</SelectItem>)}
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="requesterName" render={({ field }) => (
                <FormItem><FormLabel>Nome do Solicitante (Opcional)</FormLabel><FormControl><Input placeholder="Quem abriu o chamado no cliente" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="phase" render={({ field }) => (
                  <FormItem><FormLabel>Fase da OS</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isOrderConcludedOrCancelled && !!editingOrder}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione a fase" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {serviceOrderPhaseOptions.map(phase => <SelectItem key={phase} value={phase}>{phase}</SelectItem>)}
                      </SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
                 <FormField control={form.control} name="technicianId" render={({ field }) => (
                  <FormItem><FormLabel>Técnico Responsável</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || NO_TECHNICIAN_SELECTED_VALUE}>
                      <FormControl><SelectTrigger><SelectValue placeholder={isLoadingTechnicians ? "Carregando..." : "Selecione um técnico"} /></SelectTrigger></FormControl>
                      <SelectContent>
                         <SelectItem value={NO_TECHNICIAN_SELECTED_VALUE}>Não Atribuído</SelectItem>
                        {technicians.map(tech => <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>)}
                      </SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />
              </div>
               <FormField control={form.control} name="serviceType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Serviço</FormLabel>
                  <Select onValueChange={handleServiceTypeChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo de serviço" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {serviceTypeOptionsList.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      <SelectItem value={CUSTOM_SERVICE_TYPE_VALUE}>Outro (Especificar)</SelectItem>
                    </SelectContent>
                  </Select>
                  {showCustomServiceType && (
                    <FormField control={form.control} name="customServiceType" render={({ field: customField }) => (
                      <FormItem className="mt-2"><FormControl><Input placeholder="Especifique o tipo de serviço" {...customField} value={customField.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                  )}
                  <FormMessage />
                </FormItem>
              )} />

                <FormField control={form.control} name="vehicleId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Veículo Utilizado (Opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || NO_VEHICLE_SELECTED_VALUE}>
                    <FormControl><SelectTrigger><SelectValue placeholder={isLoadingVehicles ? "Carregando..." : "Selecione um veículo"} /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value={NO_VEHICLE_SELECTED_VALUE}>Nenhum / Não se aplica</SelectItem>
                      {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.model} ({v.licensePlate})</SelectItem>)}
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem><FormLabel>Data de Início</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem><FormLabel>Data de Conclusão Prevista (Opcional)</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="estimatedTravelDistanceKm" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Distância Estimada Viagem (km, ida e volta)</FormLabel>
                        <div className="flex items-center gap-2">
                            <FormControl>
                                <Input type="number" step="0.1" placeholder="Ex: 120.5" {...field}
                                       onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                                       value={field.value ?? ""}
                                />
                            </FormControl>
                             <Button type="button" variant="ghost" size="icon" onClick={() => form.setValue('estimatedTravelDistanceKm', null)} disabled={isCalculatingDistance}>
                                {isCalculatingDistance ? <Loader2 className="h-4 w-4 animate-spin"/> : <Brain className="h-4 w-4"/>}
                                <span className="sr-only">Recalcular Distância com IA</span>
                            </Button>
                        </div>
                        <FormDescription>Preenchido automaticamente ou manualmente.</FormDescription>
                        <FormMessage/>
                    </FormItem>
                )}/>
                <FormField control={form.control} name="estimatedTollCosts" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Custos de Pedágio Estimados (R$, ida e volta)</FormLabel>
                         <div className="flex items-center gap-2">
                            <FormControl>
                                <Input type="number" step="0.01" placeholder="Ex: 25.50" {...field}
                                      onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                                      value={field.value ?? ""}
                                />
                            </FormControl>
                             <Button type="button" variant="ghost" size="icon" onClick={() => form.setValue('estimatedTollCosts', null)} disabled={isCalculatingDistance}>
                                {isCalculatingDistance ? <Loader2 className="h-4 w-4 animate-spin"/> : <Brain className="h-4 w-4"/>}
                                <span className="sr-only">Recalcular Pedágio com IA</span>
                            </Button>
                        </div>
                        <FormDescription>Estimado pela IA se a rota tiver pedágios.</FormDescription>
                        <FormMessage/>
                    </FormItem>
                )}/>
              </div>
               <FormField control={form.control} name="estimatedTravelCost" render={({ field }) => (
                <FormItem>
                    <FormLabel>Custo Total de Viagem Estimado (R$)</FormLabel>
                    <FormControl>
                        <Input type="number" step="0.01" {...field}
                              value={field.value ?? ""}
                              readOnly
                              className="bg-muted/50"
                        />
                    </FormControl>
                    <FormDescription>Calculado: (Distância * Custo/km Veículo) + Pedágios.</FormDescription>
                    <FormMessage/>
                </FormItem>
              )}/>


              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Problema Relatado / Descrição do Serviço</FormLabel><FormControl><Textarea placeholder="Descreva o problema ou o serviço a ser realizado" {...field} rows={4} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações Internas (Opcional)</FormLabel><FormControl><Textarea placeholder="Notas internas, detalhes adicionais, etc." {...field} value={field.value ?? ""} rows={3} /></FormControl><FormMessage /></FormItem>
              )} />

              <FormItem>
                <FormLabel>Mídia (Fotos/Vídeos - Máx. {MAX_FILES_ALLOWED} arquivos)</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    disabled={(formMediaUrls?.length || 0) + mediaFiles.length >= MAX_FILES_ALLOWED || (isOrderConcludedOrCancelled && !!editingOrder)}
                  />
                </FormControl>
                <FormDescription>
                  Arquivos selecionados para upload: {mediaFiles.length}.
                  Arquivos existentes: {formMediaUrls?.length || 0}.
                  Total: {(formMediaUrls?.length || 0) + mediaFiles.length} de {MAX_FILES_ALLOWED}.
                </FormDescription>
                <div className="mt-2 space-y-2">
                  {formMediaUrls?.map((url, index) => (
                    <div key={`existing-${index}`} className="flex items-center justify-between p-2 border rounded-md bg-muted/50 text-sm">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex items-center gap-1">
                        <LinkIconLI className="h-3 w-3"/> {getFileNameFromUrl(url)} (Salvo)
                      </a>
                      {(!isOrderConcludedOrCancelled || !editingOrder) && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveExistingUrl(url)} className="text-destructive hover:text-destructive">
                          <XCircle className="h-4 w-4 mr-1"/> Remover
                        </Button>
                      )}
                    </div>
                  ))}
                  {mediaFiles.map((file, index) => (
                    <div key={`new-${index}`} className="flex items-center justify-between p-2 border rounded-md text-sm">
                      <span className="truncate">{file.name} (Novo)</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveNewFile(index)} className="text-destructive hover:text-destructive">
                        <XCircle className="h-4 w-4 mr-1"/> Remover
                      </Button>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            </fieldset>
          </form>
        </Form>
      </FormModal>

      <AlertDialog open={isConclusionModalOpen} onOpenChange={setIsConclusionModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir Ordem de Serviço: {editingOrder?.orderNumber}</AlertDialogTitle>
            <AlertDialogDescription>
              Descreva a conclusão técnica do serviço. Esta informação será registrada e poderá ser usada no recibo do cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="technical-conclusion" className="text-sm font-medium">
              Conclusão Técnica
            </Label>
            <Textarea
              id="technical-conclusion"
              value={technicalConclusionText}
              onChange={(e) => setTechnicalConclusionText(e.target.value)}
              placeholder="Detalhe os serviços realizados e a solução aplicada..."
              rows={5}
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsConclusionModalOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmConclusion} disabled={!technicalConclusionText.trim()} className={buttonVariants({className: "bg-green-600 hover:bg-green-700"})}>
              <Check className="mr-2 h-4 w-4"/> Concluir OS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

       <AlertDialog open={isCancelConfirmModalOpen} onOpenChange={setIsCancelConfirmModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Ordem de Serviço: {editingOrder?.orderNumber}</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar esta Ordem de Serviço? Esta ação não pode ser desfeita e marcará a OS como 'Cancelada'.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsCancelConfirmModalOpen(false)}>Manter OS</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className={buttonVariants({variant: "destructive"})}>
               <Ban className="mr-2 h-4 w-4"/> Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </TooltipProvider>
  );
}
