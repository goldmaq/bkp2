
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, ClipboardList, User, Construction, HardHat, Settings2, Calendar, FileText, Play, Check, AlertTriangle as AlertIconLI, X, Loader2, CarFront as VehicleIcon, UploadCloud, Link as LinkIconLI, XCircle, AlertTriangle, Save, Trash2, Pencil, ClipboardEdit, ThumbsUp, PackageSearch, Ban, Phone, Building, Route, Coins as CoinsIcon, Brain, Search as SearchIcon, Tag, Layers, CalendarDays as CalendarIconDetails, MapPin, Printer } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { ServiceOrder, Customer, Maquina, Technician, Vehicle, ServiceOrderPhaseType, OwnerReferenceType, Company, CompanyId } from "@/types";
import { ServiceOrderSchema, serviceTypeOptionsList, serviceOrderPhaseOptions, companyDisplayOptions, OWNER_REF_CUSTOMER, companyIds, maquinaTypeOptions, maquinaOperationalStatusOptions } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
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
import { DialogFooter } from "@/components/ui/dialog";
import { calculateDistance, type CalculateDistanceInput, type CalculateDistanceOutput } from "@/ai/flows/calculate-distance-flow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toTitleCase, getFileNameFromUrl, formatDateForInput, getWhatsAppNumber, formatPhoneNumberForInputDisplay, parseNumericToNullOrNumber, formatAddressForDisplay, generateGoogleMapsUrl } from "@/lib/utils";


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

async function fetchCompanies(): Promise<Company[]> {
  if (!db) {
    console.error("fetchCompanies: Firebase DB is not available.");
    throw new Error("Firebase DB is not available");
  }
  const companyDocs: Company[] = [];
  for (const id of companyIds) {
    const docRef = doc(db, FIRESTORE_COMPANY_COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      companyDocs.push({ id, ...docSnap.data() } as Company);
    }
  }
  return companyDocs;
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

const printHTML = (htmlContent: string, documentTitle: string) => {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(
`<!DOCTYPE html>
<html>
  <head>
    <title>${documentTitle}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
      .print-container { width: 100%; max-width: 800px; margin: 0 auto; }
      .print-header { text-align: center; margin-bottom: 20px; }
      .print-header h1 { font-size: 18px; margin: 0; color: #F97316; }
      .print-header p { font-size: 10px; margin: 2px 0; color: #555; }
      .section { margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
      .section:last-child { border-bottom: none; }
      .section-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; color: #333; }
      .field-group { margin-bottom: 6px; }
      .field-label { font-weight: bold; color: #444; min-width: 120px; display: inline-block; }
      .field-value { color: #666; }
      .two-columns { display: flex; justify-content: space-between; }
      .column { width: 48%; }
      .signature-area { margin-top: 30px; padding-top: 10px; border-top: 1px dashed #ccc; }
      .signature-line { border-bottom: 1px solid #000; width: 250px; margin: 30px auto 5px auto; }
      .signature-label { text-align: center; font-size: 10px; color: #555; }
      .footer-notes { margin-top: 20px; font-size: 10px; color: #777; text-align: center; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
      th { background-color: #f9f9f9; font-weight: bold; }
      .notes-section { margin-top:15px; }
      .notes-section textarea { width: 98%; min-height: 80px; border: 1px solid #ccc; padding: 5px; font-size: 11px; }
      @media print {
        body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-header h1 { color: #F97316 !important; }
        .no-print { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="print-container">
      ${htmlContent}
    </div>
    <script>
      setTimeout(() => {
        window.print();
        window.onafterprint = function() { window.close(); }
      }, 250);
    </script>
  </body>
</html>`
    );
    printWindow.document.close();
  } else {
    alert("Seu navegador bloqueou a abertura da janela de impressão. Por favor, desabilite o bloqueador de pop-ups para este site.");
  }
};


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


  const { data: serviceOrdersRaw = [], isLoading: isLoadingServiceOrders, isError: isErrorServiceOrders, error: errorServiceOrders } = useQuery<ServiceOrder[], Error>({
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

  const { data: companies = [], isLoading: isLoadingCompanies } = useQuery<Company[], Error>({
      queryKey: [FIRESTORE_COMPANY_COLLECTION_NAME],
      queryFn: fetchCompanies,
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
        const originCompany = (companies || []).find(comp => comp.id === companyOwnerId);

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

        console.log(`[OS ClientPage] Attempting distance calculation. Origin: "${originAddress}", Destination: "${destinationAddress}"`);

        if (currentDistanceValue !== null && currentDistanceValue !== undefined) {
            console.log(`[OS ClientPage] Distance already set to ${currentDistanceValue}km. Skipping automatic calculation.`);
            return;
        }

        setIsCalculatingDistance(true);
        try {
          console.log(`[OS ClientPage] Calling calculateDistance flow with Origin: "${originAddress}", Destination: "${destinationAddress}"`);
          const result: CalculateDistanceOutput = await calculateDistance({ originAddress, destinationAddress });
          console.log("[OS ClientPage] Flow result:", result);


          let toastMessage = "";
          if (result.status === 'SIMULATED' || result.status === 'SUCCESS') {
            const roundTripDistance = parseFloat((result.distanceKm * 2).toFixed(1));
            form.setValue('estimatedTravelDistanceKm', roundTripDistance, { shouldValidate: true });
            toastMessage += `Distância (ida/volta): ${roundTripDistance} km (${result.status === 'SIMULATED' ? 'Simulado' : 'Calculado'}).`;
            console.log(`[OS ClientPage] Set estimatedTravelDistanceKm to: ${roundTripDistance}`);

            if ((currentTollValue === null || currentTollValue === undefined) &&
                result.estimatedTollCostByAI && result.estimatedTollCostByAI > 0) {
              const roundTripTollAI = parseFloat((result.estimatedTollCostByAI * 2).toFixed(2));
              form.setValue('estimatedTollCosts', roundTripTollAI, { shouldValidate: true });
              toastMessage += ` Pedágio (est. IA): R$ ${roundTripTollAI}.`;
              console.log(`[OS ClientPage] Set estimatedTollCosts (AI) to: ${roundTripTollAI}`);
            } else if (result.estimatedTollCostByAI === 0) {
              toastMessage += ` Estimativa de pedágio pela IA: R$ 0.00.`;
               console.log(`[OS ClientPage] AI estimatedTollCostByAI is 0. No update to form field.`);
            }
            toast({ title: "Estimativas Calculadas", description: toastMessage.trim() });

          } else {
            toast({ title: "Falha ao Calcular Distância", description: result.errorMessage || "Não foi possível calcular a distância automaticamente.", variant: "default" });
             console.warn(`[OS ClientPage] Distance calculation failed/returned non-success status: ${result.status}, Message: ${result.errorMessage}`);
          }
        } catch (e: any) {
          console.error("[OS ClientPage] Error calling calculateDistance flow:", e);
          toast({ title: "Erro no Cálculo de Distância", description: e.message || "Ocorreu um erro ao tentar calcular a distância.", variant: "destructive" });
        } finally {
          setIsCalculatingDistance(false);
        }
      }
    };

    if (isModalOpen && (!editingOrder || (editingOrder && isEditMode)) && !isCalculatingDistance) {
        attemptCalculateDistanceAndTolls().catch(err => {
            console.error("[OS ClientPage] Error in attemptCalculateDistanceAndTolls useEffect:", err);
            setIsCalculatingDistance(false);
        });
    }
  }, [
    isModalOpen, editingOrder, isEditMode, selectedCustomerId, formEquipmentId,
    isCalculatingDistance, customers, equipmentList, companies, form, toast
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
        const newUploadedUrls: string[] = [];
        for (const file of data.filesToUpload) {
          const url = await uploadServiceOrderFile(file, data.id);
          newUploadedUrls.push(url);
        }
        finalMediaUrls = [...finalMediaUrls, ...newUploadedUrls];
      }

      const urlsToDelete = data.originalMediaUrls.filter(originalUrl => !data.existingUrlsToKeep.includes(originalUrl));
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
    onSettled: () => setIsUploadingFile(false)
  });

  const concludeServiceOrderMutation = useMutation({
    mutationFn: async (data: { orderId: string; conclusionText: string; currentEndDate?: string | null }) => {
      if (!db) throw new Error("Firebase DB is not available for concluding service order.");
      const orderRef = doc(db, FIRESTORE_COLLECTION_NAME, data.orderId);
      let finalEndDate = convertToTimestamp(data.currentEndDate);
      if (!finalEndDate) {
        finalEndDate = Timestamp.now();
      }
      await updateDoc(orderRef, {
        phase: "Concluída",
        technicalConclusion: data.conclusionText,
        endDate: finalEndDate,
      });
      return data.orderId;
    },
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Ordem de Serviço Concluída", description: `A OS foi marcada como concluída.` });
      setIsConclusionModalOpen(false);
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Concluir OS", description: `Não foi possível concluir a OS. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const cancelServiceOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (!db) throw new Error("Firebase DB is not available for cancelling service order.");
      const orderRef = doc(db, FIRESTORE_COLLECTION_NAME, orderId);
      await updateDoc(orderRef, {
        phase: "Cancelada",
      });
      return orderId;
    },
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Ordem de Serviço Cancelada", description: `A OS foi marcada como cancelada.` });
      setIsCancelConfirmModalOpen(false);
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Cancelar OS", description: `Não foi possível cancelar a OS. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const deleteServiceOrderMutation = useMutation({
    mutationFn: async (orderToDelete: ServiceOrder) => {
      if (!db) throw new Error("Firebase DB is not available for deleting service order.");
      if (!orderToDelete?.id) throw new Error("ID da OS é necessário para exclusão.");

      if (orderToDelete.mediaUrls && orderToDelete.mediaUrls.length > 0) {
        await Promise.all(orderToDelete.mediaUrls.map(url => deleteServiceOrderFileFromStorage(url)));
      }
      await deleteDoc(doc(db, FIRESTORE_COLLECTION_NAME, orderToDelete.id));
      return orderToDelete.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FIRESTORE_COLLECTION_NAME] });
      toast({ title: "Ordem de Serviço Excluída", description: `A OS foi excluída.` });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao Excluir OS", description: `Não foi possível excluir a OS. Detalhe: ${err.message}`, variant: "destructive" });
    },
  });

  const openModal = useCallback((order?: ServiceOrder) => {
    setMediaFiles([]);
    if (order) {
      setEditingOrder(order);
      setIsEditMode(false);
      const isServiceTypePredefined = serviceTypeOptionsList.includes(order.serviceType as any);
      form.reset({
        ...order,
        startDate: formatDateForInput(order.startDate),
        endDate: formatDateForInput(order.endDate),
        vehicleId: order.vehicleId || null,
        technicianId: order.technicianId || null,
        mediaUrls: order.mediaUrls || [],
        serviceType: isServiceTypePredefined ? order.serviceType : CUSTOM_SERVICE_TYPE_VALUE,
        customServiceType: isServiceTypePredefined ? "" : order.serviceType,
        technicalConclusion: order.technicalConclusion || null,
        notes: order.notes || "",
        requesterName: order.requesterName || "",
        estimatedTravelDistanceKm: order.estimatedTravelDistanceKm !== undefined && order.estimatedTravelDistanceKm !== null ? Number(order.estimatedTravelDistanceKm) : null,
        estimatedTollCosts: order.estimatedTollCosts !== undefined && order.estimatedTollCosts !== null ? Number(order.estimatedTollCosts) : null,
        estimatedTravelCost: order.estimatedTravelCost !== undefined && order.estimatedTravelCost !== null ? Number(order.estimatedTravelCost) : null,
      });
      setShowCustomServiceType(!isServiceTypePredefined);
    } else {
      setEditingOrder(null);
      setIsEditMode(true);
      const nextOrderNum = getNextOrderNumber(serviceOrdersRaw);
      form.reset({
        orderNumber: nextOrderNum,
        customerId: "", equipmentId: NO_EQUIPMENT_SELECTED_VALUE, phase: "Aguardando Avaliação Técnica", technicianId: null,
        requesterName: "", serviceType: "", customServiceType: "", vehicleId: null, description: "",
        notes: "", startDate: formatDateForInput(new Date().toISOString()), endDate: "",
        mediaUrls: [], technicalConclusion: null,
        estimatedTravelDistanceKm: null, estimatedTollCosts: null, estimatedTravelCost: null,
      });
      setShowCustomServiceType(false);
    }
    setIsModalOpen(true);
  }, [form, serviceOrdersRaw]);

  useEffect(() => {
    if (serviceOrderIdFromUrl && !isLoadingServiceOrders && serviceOrdersRaw.length > 0 && !isModalOpen) {
      const orderToEdit = serviceOrdersRaw.find(order => order.id === serviceOrderIdFromUrl);
      if (orderToEdit) {
        openModal(orderToEdit);
        if (typeof window !== "undefined") {
           window.history.replaceState(null, '', '/service-orders');
        }
      }
    }
  }, [serviceOrderIdFromUrl, serviceOrdersRaw, isLoadingServiceOrders, openModal, isModalOpen]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setMediaFiles([]);
    form.reset();
    setShowCustomServiceType(false);
    setIsConclusionModalOpen(false);
    setTechnicalConclusionText("");
    setIsEditMode(false);
    setIsCancelConfirmModalOpen(false);
    setIsCalculatingDistance(false);
  };

  const onSubmit = async (values: z.infer<typeof ServiceOrderSchema>) => {
    const existingUrlsToKeep = form.getValues('mediaUrls') || [];
    const newFilesToUpload = mediaFiles;
    const originalMediaUrls = editingOrder?.mediaUrls || [];

    if (editingOrder?.id && (editingOrder.phase === 'Concluída' || editingOrder.phase === 'Cancelada')) {
        updateServiceOrderMutation.mutate({
          id: editingOrder.id,
          formData: values,
          filesToUpload: newFilesToUpload,
          existingUrlsToKeep,
          originalMediaUrls
        });
        return;
    }

    if (editingOrder && editingOrder.id) {
      updateServiceOrderMutation.mutate({
        id: editingOrder.id,
        formData: values,
        filesToUpload: newFilesToUpload,
        existingUrlsToKeep,
        originalMediaUrls
      });
    } else {
      addServiceOrderMutation.mutate({ formData: values, filesToUpload: newFilesToUpload });
    }
  };

  const handleModalDeleteConfirm = () => {
    if (editingOrder && editingOrder.id) {
       if (window.confirm(`Tem certeza que deseja excluir a Ordem de Serviço "${editingOrder.orderNumber}"? Esta ação não pode ser desfeita.`)) {
        deleteServiceOrderMutation.mutate(editingOrder);
      }
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    const currentExistingUrlsCount = form.getValues('mediaUrls')?.length || 0;
    const availableSlotsForNewSelection = MAX_FILES_ALLOWED - currentExistingUrlsCount;

    if (files.length > availableSlotsForNewSelection) {
      toast({
        title: "Limite de Arquivos Excedido",
        description: `Você pode anexar no máximo ${MAX_FILES_ALLOWED} arquivos. Você já tem ${currentExistingUrlsCount} e tentou adicionar ${files.length}. Selecione no máximo ${availableSlotsForNewSelection} novo(s) arquivo(s).`,
        variant: "destructive",
      });
      setMediaFiles(files.slice(0, availableSlotsForNewSelection));
    } else {
      setMediaFiles(files);
    }
    if (event.target) {
        event.target.value = '';
    }
  };

  const handleRemoveAllExistingAttachments = () => {
    if (editingOrder && window.confirm("Tem certeza que deseja remover TODOS os anexos existentes desta Ordem de Serviço? Os arquivos serão excluídos ao salvar.")) {
      form.setValue('mediaUrls', []);
      toast({title: "Anexos Marcados para Remoção", description: "Os anexos existentes serão removidos ao salvar o formulário."})
    }
  };


  const handleServiceTypeChange = (value: string) => {
    form.setValue('serviceType', value);
    setShowCustomServiceType(value === CUSTOM_SERVICE_TYPE_VALUE);
    if (value !== CUSTOM_SERVICE_TYPE_VALUE) {
      form.setValue('customServiceType', "");
    }
  };

  const handleOpenConclusionModal = () => {
    if (editingOrder) {
      setTechnicalConclusionText(form.getValues("technicalConclusion") || editingOrder.technicalConclusion || "");
      setIsConclusionModalOpen(true);
    }
  };

  const handleFinalizeConclusion = () => {
    if (editingOrder && editingOrder.id) {
      if (!technicalConclusionText.trim()) {
        toast({ title: "Campo Obrigatório", description: "A conclusão técnica não pode estar vazia.", variant: "destructive"});
        return;
      }
      concludeServiceOrderMutation.mutate({
        orderId: editingOrder.id,
        conclusionText: technicalConclusionText,
        currentEndDate: form.getValues("endDate"),
      });
    }
  };

  const handleOpenCancelConfirmModal = () => {
    if (editingOrder) {
      setIsCancelConfirmModalOpen(true);
    }
  };

  const handleFinalizeCancellation = () => {
    if (editingOrder && editingOrder.id) {
      cancelServiceOrderMutation.mutate(editingOrder.id);
    }
  };

  const generatePrintHTMLForTechnician = (
    order: ServiceOrder,
    customer?: Customer,
    equipment?: Maquina,
    technicianName?: string,
    vehicle?: { identifier: string }
  ): string => {
    const companyInfo = companies?.find(c => c.id === 'goldmaq');

    return `
      <div class="print-header">
        <h1>${companyInfo?.name || 'Gold Maq Empilhadeiras'} - Ordem de Serviço Técnico</h1>
        <p>${formatAddressToString(companyInfo)}</p>
        <p>CNPJ: ${companyInfo?.cnpj || 'N/A'}</p>
      </div>
      <div class="section">
        <div class="section-title">Informações da OS</div>
        <div class="two-columns">
          <div class="column">
            <div class="field-group"><span class="field-label">Número OS:</span> <span class="field-value">${order.orderNumber}</span></div>
            <div class="field-group"><span class="field-label">Data Abertura:</span> <span class="field-value">${order.startDate ? formatDateForDisplay(order.startDate) : 'N/A'}</span></div>
          </div>
          <div class="column">
            <div class="field-group"><span class="field-label">Data Prev. Conclusão:</span> <span class="field-value">${order.endDate ? formatDateForDisplay(order.endDate) : 'N/A'}</span></div>
            <div class="field-group"><span class="field-label">Técnico Designado:</span> <span class="field-value">${toTitleCase(technicianName) || 'Não Atribuído'}</span></div>
          </div>
        </div>
        <div class="field-group"><span class="field-label">Tipo de Serviço:</span> <span class="field-value">${toTitleCase(order.serviceType)}</span></div>
      </div>
      <div class="section">
        <div class="section-title">Dados do Cliente</div>
        <div class="field-group"><span class="field-label">Empresa:</span> <span class="field-value">${toTitleCase(customer?.name) || 'N/A'}</span></div>
        <div class="field-group"><span class="field-label">CNPJ:</span> <span class="field-value">${customer?.cnpj || 'N/A'}</span></div>
        <div class="field-group"><span class="field-label">Solicitante:</span> <span class="field-value">${toTitleCase(order.requesterName) || 'N/A'}</span></div>
        <div class="field-group"><span class="field-label">Telefone:</span> <span class="field-value">${customer?.phone ? formatPhoneNumberForInputDisplay(customer.phone) : 'N/A'}</span></div>
        <div class="field-group"><span class="field-label">Endereço:</span> <span class="field-value">${formatAddressForDisplay(customer)}</span></div>
      </div>
      <div class="section">
        <div class="section-title">Dados da Máquina</div>
        <div class="two-columns">
          <div class="column">
            <div class="field-group"><span class="field-label">Marca:</span> <span class="field-value">${toTitleCase(equipment?.brand) || 'N/A'}</span></div>
            <div class="field-group"><span class="field-label">Modelo:</span> <span class="field-value">${toTitleCase(equipment?.model) || 'N/A'}</span></div>
          </div>
          <div class="column">
            <div class="field-group"><span class="field-label">Nº Chassi:</span> <span class="field-value">${equipment?.chassisNumber || 'N/A'}</span></div>
            <div class="field-group"><span class="field-label">Ano:</span> <span class="field-value">${equipment?.manufactureYear || 'N/A'}</span></div>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-title">Problema Relatado / Solicitação</div>
        <p class="field-value" style="white-space: pre-wrap;">${order.description || 'Nenhum problema relatado.'}</p>
      </div>
      ${order.notes ? `<div class="section">
        <div class="section-title">Observações da OS</div>
        <p class="field-value" style="white-space: pre-wrap;">${order.notes}</p>
      </div>` : ''}
      <div class="section notes-section">
        <div class="section-title">Diagnóstico Técnico / Serviços Realizados</div>
        <textarea rows="5"></textarea>
      </div>
      <div class="section notes-section">
        <div class="section-title">Peças Utilizadas</div>
        <textarea rows="3"></textarea>
      </div>
      <div class="signature-area">
        <div class="signature-line"></div>
        <div class="signature-label">Assinatura do Técnico</div>
      </div>
      <div class="signature-area">
        <div class="signature-line"></div>
        <div class="signature-label">Assinatura do Cliente / Responsável</div>
      </div>
       <div class="footer-notes">
         Documento gerado em: ${formatDateForDisplay(new Date().toISOString())}
      </div>
    `;
  };

  const generatePrintHTMLForCustomer = (
    order: ServiceOrder,
    customer?: Customer,
    equipment?: Maquina
  ): string => {
    const companyInfo = companies?.find(c => c.id === 'goldmaq');
    return `
      <div class="print-header">
        <h1>${companyInfo?.name || 'Gold Maq Empilhadeiras'} - Comprovante de Atendimento</h1>
         <p>${formatAddressToString(companyInfo)}</p>
        <p>CNPJ: ${companyInfo?.cnpj || 'N/A'}</p>
      </div>
      <div class="section">
        <div class="section-title">Informações do Atendimento</div>
        <div class="field-group"><span class="field-label">Número OS:</span> <span class="field-value">${order.orderNumber}</span></div>
        <div class="field-group"><span class="field-label">Data Abertura:</span> <span class="field-value">${order.startDate ? formatDateForDisplay(order.startDate) : 'N/A'}</span></div>
        <div class="field-group"><span class="field-label">Data Conclusão:</span> <span class="field-value">${order.endDate ? formatDateForDisplay(order.endDate) : 'N/A'}</span></div>
      </div>
      <div class="section">
        <div class="section-title">Dados do Cliente</div>
        <div class="field-group"><span class="field-label">Empresa:</span> <span class="field-value">${toTitleCase(customer?.name) || 'N/A'}</span></div>
         <div class="field-group"><span class="field-label">CNPJ:</span> <span class="field-value">${customer?.cnpj || 'N/A'}</span></div>
        <div class="field-group"><span class="field-label">Endereço:</span> <span class="field-value">${formatAddressForDisplay(customer)}</span></div>
      </div>
      <div class="section">
        <div class="section-title">Dados da Máquina</div>
         <div class="field-group"><span class="field-label">Marca/Modelo:</span> <span class="field-value">${toTitleCase(equipment?.brand) || 'N/A'} ${toTitleCase(equipment?.model) || ''}</span></div>
        <div class="field-group"><span class="field-label">Nº Chassi:</span> <span class="field-value">${equipment?.chassisNumber || 'N/A'}</span></div>
      </div>
      <div class="section">
        <div class="section-title">Problema Relatado</div>
        <p class="field-value" style="white-space: pre-wrap;">${order.description || 'N/A'}</p>
      </div>
      ${order.technicalConclusion ? `<div class="section">
        <div class="section-title">Conclusão Técnica / Serviços Realizados</div>
        <p class="field-value" style="white-space: pre-wrap;">${order.technicalConclusion}</p>
      </div>` : ''}
      ${order.notes ? `<div class="section">
        <div class="section-title">Observações Adicionais</div>
        <p class="field-value" style="white-space: pre-wrap;">${order.notes}</p>
      </div>` : ''}
      <div class="signature-area">
        <div class="signature-line"></div>
        <div class="signature-label">Assinatura do Cliente / Responsável</div>
      </div>
      <div class="footer-notes">
        Agradecemos a preferência! <br/>
        Documento gerado em: ${formatDateForDisplay(new Date().toISOString())}
      </div>
    `;
  };

  const handlePrintForTechnician = () => {
    if (!editingOrder) return;
    const customer = getCustomerDetails(editingOrder.customerId);
    const equipment = getEquipmentDetails(editingOrder.equipmentId);
    const technicianName = getTechnicianName(editingOrder.technicianId);
    const vehicleInfo = getVehicleDetails(editingOrder.vehicleId);
    const htmlContent = generatePrintHTMLForTechnician(editingOrder, customer, equipment, technicianName, vehicleInfo);
    printHTML(htmlContent, `OS_Tecnico_${editingOrder.orderNumber}`);
  };

  const handlePrintForCustomer = () => {
    if (!editingOrder) return;
    const customer = getCustomerDetails(editingOrder.customerId);
    const equipment = getEquipmentDetails(editingOrder.equipmentId);
    const htmlContent = generatePrintHTMLForCustomer(editingOrder, customer, equipment);
    printHTML(htmlContent, `Comprovante_OS_${editingOrder.orderNumber}`);
  };


  const isOrderConcludedOrCancelled = editingOrder?.phase === 'Concluída' || editingOrder?.phase === 'Cancelada';
  const isMutating = addServiceOrderMutation.isPending || updateServiceOrderMutation.isPending || isUploadingFile || concludeServiceOrderMutation.isPending || cancelServiceOrderMutation.isPending || deleteServiceOrderMutation.isPending;
  const isLoadingPageData = isLoadingServiceOrders || isLoadingCustomers || isLoadingEquipment || isLoadingTechnicians || isLoadingVehicles || isLoadingCompanies;

  if (isLoadingPageData && !isModalOpen) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Carregando dados...</p>
      </div>
    );
  }

  if (isErrorServiceOrders) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertIconLI className="h-12 w-12 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao Carregar Ordens de Serviço</h2>
        <p className="text-center">Não foi possível buscar os dados. Tente novamente mais tarde.</p>
        <p className="text-sm mt-2">Detalhe: ${errorServiceOrders?.message}</p>
      </div>
    );
  }


  const getVehicleDetails = (id?: string | null): { identifier: string, id?: string } => {
    if (!id) return { identifier: "N/A" };
    const vehicle = (vehicles || []).find(v => v.id === id);
    return vehicle ? { identifier: `${vehicle.model} (${vehicle.licensePlate})`, id: vehicle.id } : { identifier: id };
  };

  const generateWhatsAppMessage = (
    order: ServiceOrder,
    customer: Customer | undefined,
    equipment: Maquina | undefined,
    technicianName: string
  ): string => {
    if (!customer) return "Erro: Cliente não encontrado.";
    let message = `Olá ${toTitleCase(customer.name)},\\n\\n`;
    message += `Referente à Ordem de Serviço Nº: *${order.orderNumber}*.\\n\\n`;
    message += `*Cliente:* ${toTitleCase(customer.name)}\\n`;
    if (equipment) {
        message += `*Equipamento:* ${toTitleCase(equipment.brand)} ${toTitleCase(equipment.model)} (Chassi: ${equipment.chassisNumber})\\n`;
    } else {
        message += `*Equipamento:* Não especificado\\n`;
    }
    message += `*Fase Atual:* ${order.phase}\\n`;
    message += `*Problema Relatado:* ${order.description}\\n`;
    if (technicianName !== "Não Atribuído") {
      message += `*Técnico Designado:* ${toTitleCase(technicianName)}\\n`;
    }
    if (order.startDate && typeof order.startDate === 'string' && isValid(parseISO(order.startDate))) {
      message += `*Data de Início:* ${format(parseISO(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}\\n`;
    }
    if (order.endDate && typeof order.endDate === 'string' && isValid(parseISO(order.endDate))) {
      message += `*Previsão de Conclusão:* ${format(parseISO(order.endDate), 'dd/MM/yyyy', { locale: ptBR })}\\n`;
    }
    message += `\\nAtenciosamente,\\nEquipe Gold Maq`;
    return message;
  };


  return (
    <TooltipProvider>
    <>
      <PageHeader
        title="Ordens de Serviço"
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating || deleteServiceOrderMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Criar Ordem de Serviço
          </Button>
        }
      />

      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por OS, cliente, equip., técnico..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10"
          />
        </div>
        <div className="relative md:w-auto">
          <Label htmlFor="phase-filter" className="sr-only">Filtrar por Fase:</Label>
          <Select
            value={selectedPhaseFilter}
            onValueChange={(value) => setSelectedPhaseFilter(value as ServiceOrderPhaseType | "Todos")}
          >
            <SelectTrigger id="phase-filter" className="w-full md:w-[280px]">
              <SelectValue placeholder="Mostrar todas as fases" />
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

      {isLoadingServiceOrders && !isModalOpen ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Carregando ordens de serviço...</p>
          </div>
        ) : serviceOrdersRaw.length === 0 && !isLoadingServiceOrders && selectedPhaseFilter === "Todos" && !searchTerm.trim() ? (
        <DataTablePlaceholder
          icon={ClipboardList}
          title="Nenhuma Ordem de Serviço Criada"
          description="Crie sua primeira ordem de serviço para gerenciar as operações."
          buttonLabel="Criar Ordem de Serviço"
          onButtonClick={() => openModal()}
        />
      ) : filteredServiceOrders.length === 0 ? (
        <div className="text-center py-10">
          <SearchIcon className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-lg font-semibold">Nenhuma Ordem de Serviço Encontrada</h3>
          <p className="text-sm text-muted-foreground">
            Sua busca ou filtro não retornou resultados. Tente um termo diferente ou ajuste os filtros.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServiceOrders.map((order) => {
            const deadlineInfo = getDeadlineStatusInfo(order.endDate, order.phase);
            const cardClasses = cn(
              "flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer",
            );
            const customerDetails = getCustomerDetails(order.customerId);
            const equipmentDetails = getEquipmentDetails(order.equipmentId);
            const vehicleDetails = getVehicleDetails(order.vehicleId);
            const technicianName = getTechnicianName(order.technicianId);
            const whatsappNumber = customerDetails?.phone ? getWhatsAppNumber(customerDetails.phone) : null;
            const whatsappMessage = whatsappNumber ? generateWhatsAppMessage(order, customerDetails, equipmentDetails, technicianName) : "";
            const whatsappLink = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}` : "#";
            const customerAddress = customerDetails ? formatAddressForDisplay(customerDetails) : "Endereço não disponível";
            const googleMapsLink = customerDetails ? generateGoogleMapsUrl(customerDetails) : "#";


            let equipmentOwnerDisplay = null;
            if (equipmentDetails?.ownerReference && equipmentDetails.ownerReference !== OWNER_REF_CUSTOMER) {
                const company = (companies || []).find(c => c.id === equipmentDetails.ownerReference);
                equipmentOwnerDisplay = company ? company.name : "Empresa Desconhecida";
            } else if (equipmentDetails?.ownerReference === OWNER_REF_CUSTOMER) {
                 const ownerCustomer = (customers || []).find(c => c.id === equipmentDetails.customerId);
                 equipmentOwnerDisplay = ownerCustomer ? `Cliente (${toTitleCase(ownerCustomer.name)})` : "Cliente (Não especificado)";
            }


            return (
            <Card key={order.id} className={cardClasses} onClick={() => openModal(order)} >
              {deadlineInfo.status !== 'none' && deadlineInfo.message && (
                 <div className={cn(
                  "p-2 text-sm font-medium rounded-t-md flex items-center justify-center",
                  deadlineInfo.alertClass
                )}>
                  {deadlineInfo.icon}
                  <span className="ml-2">{deadlineInfo.message}</span>
                </div>
              )}
              <CardHeader className={cn(deadlineInfo.status !== 'none' && deadlineInfo.message ? "pt-2" : "")}>
                <div className="flex justify-between items-start">
                  <CardTitle className="font-headline text-xl text-primary">OS: {order.orderNumber}</CardTitle>
                </div>
                <CardDescription className="flex items-center text-sm pt-1">
                  {phaseIcons[order.phase]}
                  <span className="font-medium text-muted-foreground ml-1 mr-1">Fase:</span>
                  <span className="text-base font-semibold">{order.phase}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-2 text-sm">
                <p className="flex items-center">
                  <User className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-muted-foreground mr-1">Cliente:</span>
                  {isLoadingCustomers || !customerDetails ? 'Carregando...' : (
                    <Link href={`/customers?openCustomerId=${customerDetails.id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline truncate" title={`Ver cliente: ${toTitleCase(customerDetails.name)}`}>
                      {toTitleCase(customerDetails.name)}
                    </Link>
                  )}
                </p>
                {customerDetails && (
                  <p className="flex items-start">
                    <MapPin className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">End.:</span>
                    {googleMapsLink !== "#" ? (
                        <a
                        href={googleMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-primary truncate"
                        onClick={(e) => e.stopPropagation()}
                        title="Abrir no Google Maps"
                        >
                        {customerAddress}
                        </a>
                    ) : (
                        <span className="truncate">{customerAddress}</span>
                    )}
                  </p>
                )}
                {customerDetails?.phone && (
                  <p className="flex items-center">
                    <Phone className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Tel:</span>
                    {whatsappNumber ? (
                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                        title={`Abrir WhatsApp para ${formatPhoneNumberForInputDisplay(customerDetails.phone)}`}
                      >
                        {formatPhoneNumberForInputDisplay(customerDetails.phone)}
                      </a>
                    ) : (
                      <span>{formatPhoneNumberForInputDisplay(customerDetails.phone)}</span>
                    )}
                  </p>
                )}
                {order.requesterName && (
                  <p className="flex items-start">
                    <User className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Solicitante:</span>
                    <span className="whitespace-pre-wrap break-words">{toTitleCase(order.requesterName)}</span>
                  </p>
                )}

                {isLoadingEquipment ? (
                  <p className="flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando equipamento...</p>
                ) : equipmentDetails ? (
                  <>
                    <p className="flex items-center">
                        <Layers className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium text-muted-foreground mr-1">Marca/Modelo:</span>
                         <Link href={`/maquinas?openMaquinaId=${equipmentDetails.id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline truncate" title={`Ver máquina: ${toTitleCase(equipmentDetails.brand)} ${toTitleCase(equipmentDetails.model)}`}>
                             {toTitleCase(equipmentDetails.brand)} {toTitleCase(equipmentDetails.model)}
                         </Link>
                    </p>
                    <p className="flex items-center">
                      <Tag className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-muted-foreground mr-1">Chassi:</span>
                      {equipmentDetails.chassisNumber || "N/A"}
                    </p>
                    {equipmentDetails.manufactureYear && (
                      <p className="flex items-center">
                        <CalendarIconDetails className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                        <span className="font-medium text-muted-foreground mr-1">Ano Fab.:</span>
                        {equipmentDetails.manufactureYear}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="flex items-center text-muted-foreground"><Construction className="mr-2 h-4 w-4" /> Equipamento não especificado</p>
                )}

                {equipmentOwnerDisplay && (
                  <p className="flex items-center">
                    <Building className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Prop. Equip.:</span>
                    <span>{toTitleCase(equipmentOwnerDisplay)}</span>
                  </p>
                )}
                <p className="flex items-center"><HardHat className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Técnico:</span> {isLoadingTechnicians ? 'Carregando...' : toTitleCase(technicianName)}</p>
                {order.vehicleId && (
                  <p className="flex items-center">
                    <VehicleIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Veículo:</span>
                    {isLoadingVehicles ? 'Carregando...' : (
                       <Link href={`/vehicles?openVehicleId=${vehicleDetails.id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline truncate" title={`Ver veículo: ${vehicleDetails.identifier}`}>
                         {vehicleDetails.identifier}
                       </Link>
                    )}
                  </p>
                )}
                 {order.estimatedTravelCost !== null && order.estimatedTravelCost !== undefined && (
                  <p className="flex items-center text-sm">
                    <CoinsIcon className="mr-2 h-4 w-4 text-primary" />
                    <span className="font-medium text-muted-foreground mr-1">Custo Viagem (Est.):</span>
                    <span>R$ {Number(order.estimatedTravelCost).toFixed(2)}</span>
                  </p>
                )}
                <p className="flex items-center"><Settings2 className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Tipo Serviço:</span> {toTitleCase(order.serviceType)}</p>
                {order.startDate && typeof order.startDate === 'string' && isValid(parseISO(order.startDate)) && <p className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Início:</span> {format(parseISO(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}</p>}
                {order.endDate && typeof order.endDate === 'string' && isValid(parseISO(order.endDate)) && <p className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Conclusão Prev.:</span> {format(parseISO(order.endDate), 'dd/MM/yyyy', { locale: ptBR })}</p>}
                <p className="flex items-start"><FileText className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Problema Relatado:</span> <span className="whitespace-pre-wrap break-words">{order.description}</span></p>
                {order.technicalConclusion && <p className="flex items-start"><Check className="mr-2 mt-0.5 h-4 w-4 text-green-500 flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Conclusão Técnica:</span> <span className="whitespace-pre-wrap break-words">{order.technicalConclusion}</span></p>}
                {order.notes && <p className="flex items-start"><FileText className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Obs.:</span> <span className="whitespace-pre-wrap break-words">{order.notes}</span></p>}
                {order.mediaUrls && order.mediaUrls.length > 0 && (
                  <div>
                     <p className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                       <UploadCloud className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> Anexos:
                     </p>
                     <ul className="list-disc list-inside space-y-1">
                       {order.mediaUrls.map((mediaUrl, index) => (
                          typeof mediaUrl === 'string' && (
                           <li key={index} className="flex items-center text-sm">
                             <LinkIconLI className="mr-2 h-3 w-3 text-primary flex-shrink-0" />
                             <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-primary hover:underline truncate flex-grow"
                                title={`Ver Mídia: ${getFileNameFromUrl(mediaUrl)}`}
                             >
                                {getFileNameFromUrl(mediaUrl)}
                             </a>
                           </li>
                          )
                       ))}
                     </ul>
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t pt-4 flex justify-end gap-2">
              </CardFooter>
            </Card>
          )})}
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingOrder ? "Editar Ordem de Serviço" : "Criar Nova Ordem de Serviço"}
        description="Gerencie os detalhes da ordem de serviço."
        formId="service-order-form"
        isSubmitting={isMutating}
        editingItem={editingOrder}
        onDeleteConfirm={handleModalDeleteConfirm}
        isDeleting={deleteServiceOrderMutation.isPending}
        deleteButtonLabel="Excluir OS"
        submitButtonLabel={editingOrder ? "Salvar Alterações" : "Criar OS"}
        isEditMode={isEditMode}
        onEditModeToggle={() => setIsEditMode(true)}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} id="service-order-form" className="space-y-4">
            <fieldset disabled={(!!editingOrder && !isEditMode) || isOrderConcludedOrCancelled}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="orderNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número da Ordem</FormLabel>
                    <FormControl>
                      <Input placeholder="Gerado automaticamente" {...field} readOnly />
                    </FormControl>
                    <FormDescription>Este número é gerado automaticamente.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="customerId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""} >
                      <FormControl><SelectTrigger>
                        <SelectValue placeholder={isLoadingCustomers ? "Carregando..." : "Selecione o Cliente"} />
                      </SelectTrigger></FormControl>
                      <SelectContent>
                        {isLoadingCustomers ? <SelectItem value="loading" disabled>Carregando...</SelectItem> :
                         customers.map(customer => (
                          <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {selectedCustomerId && !isLoadingCustomers && customers.find(c => c.id === selectedCustomerId) && (
                <div className="mt-2 p-3 border rounded-md bg-muted/20 text-sm space-y-1">
                  <h4 className="font-semibold mb-1 text-xs text-muted-foreground uppercase">Detalhes do Cliente Selecionado:</h4>
                  <p><strong>Nome:</strong> {toTitleCase(customers.find(c => c.id === selectedCustomerId)?.name || 'N/A')}</p>
                  <p><strong>Endereço:</strong> {formatAddressForDisplay(customers.find(c => c.id === selectedCustomerId))}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="equipmentId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipamento</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || NO_EQUIPMENT_SELECTED_VALUE}
                    >
                      <FormControl><SelectTrigger>
                        <SelectValue placeholder={isLoadingEquipment ? "Carregando..." : (filteredEquipmentList.length === 0 && !selectedCustomerId ? "Nenhum equipamento da frota disponível" : "Selecione o Equipamento")} />
                      </SelectTrigger></FormControl>
                      <SelectContent>
                        {isLoadingEquipment ? (
                          <SelectItem value={LOADING_EQUIPMENT_SELECT_ITEM_VALUE} disabled>Carregando...</SelectItem>
                         ) : filteredEquipmentList.length === 0 ? (
                          <SelectItem value={NO_EQUIPMENT_SELECTED_VALUE} disabled>
                            {selectedCustomerId ? "Nenhum equipamento para este cliente ou disponível na frota" : "Nenhum equipamento da frota disponível/em manutenção"}
                          </SelectItem>
                         ) : (
                          <>
                            <SelectItem value={NO_EQUIPMENT_SELECTED_VALUE}>Selecione um equipamento</SelectItem>
                            {filteredEquipmentList.map(eq => (
                              <SelectItem key={eq.id} value={eq.id}>{eq.brand} {eq.model} (Chassi: {eq.chassisNumber})</SelectItem>
                            ))}
                          </>
                         )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {formEquipmentId && formEquipmentId !== NO_EQUIPMENT_SELECTED_VALUE && !isLoadingEquipment && (
                  <Card className="md:col-span-2 bg-muted/30 p-3 my-2">
                    <CardHeader className="p-0 pb-2 mb-2 border-b">
                      <CardTitle className="text-sm font-medium">Detalhes do Equipamento Selecionado</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 text-xs space-y-1">
                      {(() => {
                        const selectedEquipment = equipmentList.find(eq => eq.id === formEquipmentId);
                        if (!selectedEquipment) return <p>Carregando detalhes...</p>;
                        return (
                          <>
                            <p><strong>Marca:</strong> {toTitleCase(selectedEquipment.brand)}</p>
                            <p><strong>Modelo:</strong> {toTitleCase(selectedEquipment.model)}</p>
                            <p><strong>Nº Chassi:</strong> {selectedEquipment.chassisNumber || "N/A"}</p>
                            <p><strong>Ano Fabricação:</strong> {selectedEquipment.manufactureYear || "N/A"}</p>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}


                <FormField control={form.control} name="phase" render={({ field }) => (
                  <FormItem><FormLabel>Fase</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isOrderConcludedOrCancelled}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione a fase" /></SelectTrigger></FormControl>
                      <SelectContent>{serviceOrderPhaseOptions.map(opt => <SelectItem key={opt} value={opt} disabled={opt === 'Concluída' && editingOrder?.phase !== 'Concluída'}>{opt}</SelectItem>)}</SelectContent>
                    </Select><FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="technicianId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Técnico (Opcional)</FormLabel>
                    <Select
                      onValueChange={(selectedValue) => field.onChange(selectedValue === NO_TECHNICIAN_SELECTED_VALUE ? null : selectedValue)}
                      value={field.value ?? NO_TECHNICIAN_SELECTED_VALUE}
                    >
                      <FormControl><SelectTrigger>
                        <SelectValue placeholder={isLoadingTechnicians ? "Carregando..." : "Atribuir Técnico (Opcional)"} />
                      </SelectTrigger></FormControl>
                      <SelectContent>
                        {isLoadingTechnicians ? (
                          <SelectItem value={LOADING_TECHNICIANS_SELECT_ITEM_VALUE} disabled>Carregando...</SelectItem>
                        ) : (
                          <>
                            <SelectItem value={NO_TECHNICIAN_SELECTED_VALUE}>Não atribuir / Opcional</SelectItem>
                            {technicians.map(tech => (
                              <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="serviceType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Serviço</FormLabel>
                    <Select onValueChange={handleServiceTypeChange} value={field.value} >
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {serviceTypeOptionsList.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        <SelectItem value={CUSTOM_SERVICE_TYPE_VALUE}>Outro (Especificar)</SelectItem>
                      </SelectContent>
                    </Select>
                    {showCustomServiceType && (
                      <FormField control={form.control} name="customServiceType" render={({ field: customField }) => (
                       <FormItem className="mt-2">
                          <FormControl><Input placeholder="Digite o tipo de serviço" {...customField} value={customField.value ?? ""}  /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                    <FormMessage />
                  </FormItem>
                )} />


                <FormField control={form.control} name="vehicleId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Veículo (Opcional)</FormLabel>
                    <Select
                      onValueChange={(selectedValue) => field.onChange(selectedValue === NO_VEHICLE_SELECTED_VALUE ? null : selectedValue)}
                      value={field.value ?? NO_VEHICLE_SELECTED_VALUE}
                    >
                      <FormControl><SelectTrigger>
                        <SelectValue placeholder={isLoadingVehicles ? "Carregando..." : "Selecione o Veículo"} />
                      </SelectTrigger></FormControl>
                      <SelectContent>
                        {isLoadingVehicles ? (
                          <SelectItem value={LOADING_VEHICLES_SELECT_ITEM_VALUE} disabled>Carregando...</SelectItem>
                         ) : (
                          <>
                            <SelectItem value={NO_VEHICLE_SELECTED_VALUE}>Nenhum</SelectItem>
                            {vehicles.map(vehicle => (
                              <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.model} ({vehicle.licensePlate})</SelectItem>
                            ))}
                          </>
                         )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem><FormLabel>Data de Início</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""}  /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem><FormLabel>Data de Conclusão (Prevista)</FormLabel><FormControl><Input type="date" {...field} value={field.value ?? ""}  /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <h3 className="text-md font-semibold pt-2 border-b pb-1 font-headline">Custos da Viagem (Opcional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField control={form.control} name="estimatedTravelDistanceKm" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="flex items-center">
                          Distância Viagem (km - total)
                          {isCalculatingDistance && <Loader2 className="h-4 w-4 animate-spin ml-2 text-primary" />}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="Ex: 120.5"
                            {...field}
                            onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                            value={field.value === null || field.value === undefined ? '' : String(field.value)}
                          />
                        </FormControl>
                         <FormDescription>Pode ser preenchido automaticamente ou manualmente.</FormDescription>
                        <FormMessage />
                    </FormItem>
                 )} />
                 <FormField control={form.control} name="estimatedTollCosts" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center">
                        Custo Pedágios (R$)
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="ml-1.5 p-0 border-0 bg-transparent cursor-help" onClick={e => e.preventDefault()}>
                               <Brain className="h-3 w-3 text-muted-foreground hover:text-primary" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            <p>Pode ser estimado pela IA (se disponível e &gt; R$0) ou preenchido manualmente. A estimativa da IA é aproximada.</p>
                          </TooltipContent>
                       </Tooltip>
                      </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="Ex: 25.50"
                            {...field}
                            onChange={e => field.onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
                            value={field.value === null || field.value === undefined ? '' : String(field.value)}
                          />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                 )} />
              </div>
                <FormField control={form.control} name="estimatedTravelCost" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Custo Estimado da Viagem (R$)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            {...field}
                            readOnly
                            placeholder="Calculado automaticamente"
                            value={field.value === null || field.value === undefined ? '' : String(field.value)}
                            className="bg-muted/50"
                          />
                        </FormControl>
                        <FormDescription>Custo total = (Distância Ida/Volta * Custo/km do Veículo) + Pedágios (Ida/Volta).</FormDescription>
                        <FormMessage />
                    </FormItem>
                )} />


              <h3 className="text-md font-semibold pt-2 border-b pb-1 font-headline">Detalhes do Serviço</h3>
              <FormField control={form.control} name="requesterName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Solicitante (Opcional)</FormLabel>
                  <FormControl><Input placeholder="Nome da pessoa que solicitou o serviço" {...field} value={field.value ?? ""}  /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Problema Relatado</FormLabel><FormControl><Textarea placeholder="Descreva o problema relatado pelo cliente ou identificado" {...field} value={field.value ?? ""}  /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>

            <div className="pt-4 space-y-2">
              {editingOrder && isEditMode && !isOrderConcludedOrCancelled && (
                <div className="flex flex-col sm:flex-row gap-2">
                   <Button type="button" variant="outline" onClick={handleOpenConclusionModal} disabled={isMutating} className="w-full sm:w-auto">
                    <Check className="mr-2 h-4 w-4" /> Concluir OS
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleOpenCancelConfirmModal} disabled={isMutating} className="w-full sm:w-auto">
                    <Ban className="mr-2 h-4 w-4" /> Cancelar OS
                  </Button>
                </div>
              )}
            </div>


            <FormItem>
              <FormLabel>Anexos (Foto/Vídeo/PDF - Opcional){(isEditMode || !editingOrder) ? ` - Máx ${MAX_FILES_ALLOWED} arquivos.` : ''}</FormLabel>
              {editingOrder && formMediaUrls && formMediaUrls.length > 0 && (
                <div className="mb-2">
                  <p className="text-sm font-medium mb-1">Anexos Existentes ({formMediaUrls.length}):</p>
                  <ul className="list-disc list-inside space-y-1">
                    {formMediaUrls.map((mediaUrl, index) => (
                      typeof mediaUrl === 'string' && (
                        <li key={`existing-${index}-${mediaUrl}`} className="flex items-center justify-between text-sm">
                          <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex-grow mr-2" title={`Ver Mídia: ${getFileNameFromUrl(mediaUrl)}`}>
                            <LinkIconLI className="h-3 w-3 inline-block mr-1"/> {getFileNameFromUrl(mediaUrl)}
                          </a>
                        </li>
                      )
                    ))}
                  </ul>
                  {isEditMode && !isOrderConcludedOrCancelled && (
                    <Button variant="link" size="sm" className="text-red-500 mt-1 p-0 h-auto" onClick={handleRemoveAllExistingAttachments} disabled={isMutating}>
                        Remover Todos os Anexos Existentes
                    </Button>
                  )}
                </div>
              )}

              {isEditMode && !isOrderConcludedOrCancelled && (
                <FormControl>
                  <Input
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={handleFileSelection}
                    className={cn("mt-1", {
                      "border-red-500": (formMediaUrls?.length || 0) + mediaFiles.length > MAX_FILES_ALLOWED,
                    })}
                    multiple
                    disabled={isMutating || isUploadingFile || (formMediaUrls?.length || 0) >= MAX_FILES_ALLOWED}
                  />
                </FormControl>
              )}

              {isEditMode && !isOrderConcludedOrCancelled && mediaFiles.length > 0 && (
                <FormDescription className="mt-2 text-sm text-muted-foreground">
                  Novos arquivos selecionados ({mediaFiles.length}): {mediaFiles.map(file => file.name).join(', ')}. <br />
                  Total de anexos após salvar: {(formMediaUrls?.length || 0) + mediaFiles.length} / {MAX_FILES_ALLOWED}.
                </FormDescription>
              )}
              {isEditMode && !isOrderConcludedOrCancelled && ((formMediaUrls?.length || 0) + mediaFiles.length) > MAX_FILES_ALLOWED && (
                <p className="text-sm font-medium text-destructive mt-1">Limite de ${MAX_FILES_ALLOWED} arquivos excedido.</p>
              )}
              <FormMessage />
            </FormItem>

            <fieldset disabled={(!!editingOrder && !isEditMode && !isOrderConcludedOrCancelled) || (isOrderConcludedOrCancelled && !isEditMode) }>
              {editingOrder && (isOrderConcludedOrCancelled || (editingOrder.phase === 'Concluída' && !isEditMode)) && (
                  <FormField control={form.control} name="technicalConclusion" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conclusão Técnica</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Nenhuma conclusão técnica registrada."
                          {...field}
                          value={field.value ?? ""}
                          readOnly={!isEditMode || editingOrder.phase === 'Cancelada'}
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações (Opcional)</FormLabel><FormControl><Textarea placeholder="Observações adicionais, peças utilizadas, etc." {...field} value={field.value ?? ""} readOnly={!isEditMode && isOrderConcludedOrCancelled && editingOrder.phase !== 'Cancelada'} /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>

            <DialogFooter className="gap-2 sm:justify-between pt-4 border-t mt-4">
                <div className="flex flex-wrap gap-2">
                    {editingOrder && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handlePrintForTechnician}
                            disabled={isMutating}
                        >
                            <Printer className="mr-2 h-4 w-4" /> Imprimir (Técnico)
                        </Button>
                    )}
                    {editingOrder && editingOrder.phase === 'Concluída' && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handlePrintForCustomer}
                            disabled={isMutating}
                        >
                            <Printer className="mr-2 h-4 w-4" /> Imprimir (Cliente)
                        </Button>
                    )}
                </div>
                <div className="flex-grow-0">
                    {editingOrder && onDeleteConfirm && isEditMode && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleModalDeleteConfirm}
                            disabled={isMutating || deleteServiceOrderMutation.isPending}
                            className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground focus:ring-destructive/50"
                        >
                            {deleteServiceOrderMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            {deleteServiceOrderMutation.isPending ? "Excluindo..." : "Excluir OS"}
                        </Button>
                    )}
                </div>
                <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={closeModal} disabled={isMutating}>
                        {isEditMode && editingOrder ? "Cancelar Edição" : "Fechar"}
                    </Button>
                    {!!editingOrder && !isEditMode && onEditModeToggle && !isOrderConcludedOrCancelled && (
                        <Button
                            type="button"
                            onClick={() => setIsEditMode(true)}
                            disabled={isMutating}
                            className="bg-accent hover:bg-accent/90 text-accent-foreground"
                        >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                        </Button>
                    )}
                    {isEditMode && (
                        <Button
                            type="submit"
                            form="service-order-form"
                            disabled={isMutating || isUploadingFile || ((formMediaUrls?.length || 0) + mediaFiles.length) > MAX_FILES_ALLOWED}
                            className="bg-primary hover:bg-primary/90"
                        >
                            {isMutating ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            {isMutating ? "Salvando..." : (editingOrder ? "Salvar Alterações" : "Criar OS")}
                        </Button>
                    )}
                </div>
            </DialogFooter>
          </form>
        </Form>
      </FormModal>

      <AlertDialog open={isConclusionModalOpen} onOpenChange={setIsConclusionModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir Ordem de Serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Por favor, forneça a conclusão técnica para esta Ordem de Serviço. Esta ação marcará a OS como "Concluída".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="technical-conclusion-input" className="text-sm font-medium">
              Conclusão Técnica
            </Label>
            <Textarea
              id="technical-conclusion-input"
              value={technicalConclusionText}
              onChange={(e) => setTechnicalConclusionText(e.target.value)}
              placeholder="Descreva a solução aplicada, peças trocadas, e o estado final do equipamento."
              rows={5}
              className="mt-1"
            />
            {concludeServiceOrderMutation.isError && (
                <p className="text-sm text-destructive mt-2">
                    Erro: {(concludeServiceOrderMutation.error as Error)?.message || "Não foi possível concluir a OS."}
                </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsConclusionModalOpen(false)} disabled={concludeServiceOrderMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalizeConclusion} disabled={concludeServiceOrderMutation.isPending || !technicalConclusionText.trim()}>
              {concludeServiceOrderMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : <Check className="mr-2 h-4 w-4" />}
              Finalizar Conclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isCancelConfirmModalOpen} onOpenChange={setIsCancelConfirmModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Ordem de Serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar esta Ordem de Serviço? A fase será alterada para "Cancelada".
              Esta ação não pode ser desfeita facilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
           {cancelServiceOrderMutation.isError && (
                <p className="text-sm text-destructive mt-2">
                    Erro: {(cancelServiceOrderMutation.error as Error)?.message || "Não foi possível cancelar a OS."}
                </p>
            )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsCancelConfirmModalOpen(false)} disabled={cancelServiceOrderMutation.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFinalizeCancellation}
              disabled={cancelServiceOrderMutation.isPending}
              className={buttonVariants({variant: "destructive"})}
            >
              {cancelServiceOrderMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : <Ban className="mr-2 h-4 w-4" />}
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
    </TooltipProvider>
  );
}
