
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type * as z from "zod";
import { PlusCircle, ClipboardList, User, Construction, HardHat, Settings2, Calendar, FileText, Play, Pause, Check, AlertTriangle as AlertIconLI, X, Loader2, CarFront as VehicleIcon, UploadCloud, Link as LinkIconLI, XCircle, AlertTriangle, Save, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { ServiceOrder, Customer, Maquina, Technician, Vehicle } from "@/types";
import { ServiceOrderSchema, serviceTypeOptionsList } from "@/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTablePlaceholder } from "@/components/shared/DataTablePlaceholder";
import { FormModal } from "@/components/shared/FormModal";
import { useToast } from "@/hooks/use-toast";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, setDoc, type DocumentData } from "firebase/firestore";
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

const MAX_FILES_ALLOWED = 5;

const phaseOptions: ServiceOrder['phase'][] = ['Pendente', 'Em Progresso', 'Aguardando Peças', 'Concluída', 'Cancelada'];
const phaseIcons = {
  Pendente: <AlertIconLI className="h-4 w-4 text-yellow-400" />,
  'Em Progresso': <Play className="h-4 w-4 text-blue-500" />,
  'Aguardando Peças': <Pause className="h-4 w-4 text-orange-500" />,
  Concluída: <Check className="h-4 w-4 text-green-500" />,
  Cancelada: <X className="h-4 w-4 text-red-500" />,
};

const FIRESTORE_COLLECTION_NAME = "ordensDeServico";
const FIRESTORE_CUSTOMER_COLLECTION_NAME = "clientes";
const FIRESTORE_EQUIPMENT_COLLECTION_NAME = "equipamentos";
const FIRESTORE_TECHNICIAN_COLLECTION_NAME = "tecnicos";
const FIRESTORE_VEHICLE_COLLECTION_NAME = "veiculos";

const NO_VEHICLE_SELECTED_VALUE = "_NO_VEHICLE_SELECTED_";
const LOADING_VEHICLES_SELECT_ITEM_VALUE = "_LOADING_VEHICLES_";
const CUSTOM_SERVICE_TYPE_VALUE = "_CUSTOM_";
const NO_EQUIPMENT_SELECTED_VALUE = "_NO_EQUIPMENT_SELECTED_";
const LOADING_EQUIPMENT_SELECT_ITEM_VALUE = "_LOADING_EQUIPMENT_";
const NO_TECHNICIAN_SELECTED_VALUE = "_NO_TECHNICIAN_SELECTED_";
const LOADING_TECHNICIANS_SELECT_ITEM_VALUE = "_LOADING_TECHNICIANS_";


const getFileNameFromUrl = (url: string): string => {
  try {
    const decodedUrl = decodeURIComponent(url);
    const pathAndQuery = decodedUrl.split('?')[0];
    const segments = pathAndQuery.split('/');
    const fileNameWithPossiblePrefix = segments.pop() || "arquivo";
    const fileNameCleaned = fileNameWithPossiblePrefix.split('?')[0];
    const finalFileName = fileNameCleaned.substring(fileNameCleaned.indexOf('_') + 1) || fileNameCleaned;
    return finalFileName || "arquivo";
  } catch (e) {
    console.error("Error parsing filename from URL:", e);
    return "arquivo";
  }
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


const formatDateForInput = (date: any): string => {
  if (!date) return "";
  let d: Date;
  if (date instanceof Timestamp) {
    d = date.toDate();
  } else if (typeof date === 'string') {
    d = parseISO(date);
  } else if (date instanceof Date) {
    d = date;
  } else {
    return "";
  }
  if (!isValid(d)) return "";
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();
  const localDate = new Date(year, month, day);
  return localDate.toISOString().split('T')[0];
};

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
  const q = query(collection(db, FIRESTORE_COLLECTION_NAME), orderBy("startDate", "desc"), orderBy("orderNumber", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(docSnap => {
    const data = docSnap.data() as DocumentData;
    const serviceOrder: ServiceOrder = {
      id: docSnap.id,
      orderNumber: data.orderNumber || "N/A",
      customerId: data.customerId || "N/A",
      equipmentId: data.equipmentId || "N/A",
      requesterName: data.requesterName || null,
      phase: (phaseOptions.includes(data.phase) ? data.phase : "Pendente") as ServiceOrder['phase'],
      technicianId: data.technicianId || null,
      serviceType: data.serviceType || "Não especificado",
      vehicleId: data.vehicleId || null,
      startDate: data.startDate ? formatDateForInput(data.startDate) : undefined,
      endDate: data.endDate ? formatDateForInput(data.endDate) : undefined,
      description: data.description || "N/A",
      notes: data.notes || null,
      mediaUrls: Array.isArray(data.mediaUrls) ? data.mediaUrls.filter(url => typeof url === 'string') : [],
      technicalConclusion: data.technicalConclusion || null,
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
 return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Maquina));
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
  phase?: ServiceOrder['phase']
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

  // console.log(`DEBUG: EndDateString: ${endDateString}, ParsedEndDate: ${parsedEndDate.toISOString()}, EndDateNormalized: ${endDateNormalized.toISOString()}, Today: ${today.toISOString()}`);

  if (isBefore(endDateNormalized, today) && !isToday(endDateNormalized)) {
    // console.log("DEBUG: Status Overdue");
    return { status: 'overdue', message: 'Atrasada!', icon: <AlertTriangle className="h-5 w-5 text-destructive" />, alertClass: "bg-destructive/20 border-destructive/50 text-destructive" };
  }
  if (isToday(endDateNormalized)) {
    // console.log("DEBUG: Status Due Today");
    return { status: 'due_today', message: 'Vence Hoje!', icon: <AlertTriangle className="h-5 w-5 text-accent" />, alertClass: "bg-accent/20 border-accent/50 text-accent" };
  }
  const twoDaysFromNow = addDays(today, 2);
  if (isBefore(endDateNormalized, twoDaysFromNow)) { // Removed isToday check here as it's covered above
    // console.log("DEBUG: Status Due Soon");
     return { status: 'due_soon', message: 'Vence em Breve', icon: <AlertTriangle className="h-5 w-5 text-accent" />, alertClass: "bg-accent/20 border-accent/50 text-accent" };
  }
  // console.log("DEBUG: Status None");
  return { status: 'none', alertClass: "" };
};


export function ServiceOrderClientPage() {
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


  const form = useForm<z.infer<typeof ServiceOrderSchema>>({
    resolver: zodResolver(ServiceOrderSchema),
    defaultValues: {
      orderNumber: "", customerId: "", equipmentId: "", phase: "Pendente", technicianId: null,
      requesterName: "", serviceType: "", customServiceType: "", vehicleId: null, description: "",
      notes: "", startDate: formatDateForInput(new Date().toISOString()), endDate: "",
      mediaUrls: [], technicalConclusion: null,
    },
  });

  const selectedCustomerId = useWatch({ control: form.control, name: 'customerId' });
  const selectedEquipmentId = useWatch({ control: form.control, name: 'equipmentId' });
  const formMediaUrls = useWatch({ control: form.control, name: 'mediaUrls' });

  const { data: serviceOrders = [], isLoading: isLoadingServiceOrders, isError: isErrorServiceOrders, error: errorServiceOrders } = useQuery<ServiceOrder[], Error>({
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
        (eq.ownerReference && ['goldmaq', 'goldcomercio', 'goldjob'].includes(eq.ownerReference) && (eq.operationalStatus === "Disponível" || eq.operationalStatus === "Em Manutenção"))
      );
    }
    return equipmentList.filter(eq =>
      eq.ownerReference && ['goldmaq', 'goldcomercio', 'goldjob'].includes(eq.ownerReference) && (eq.operationalStatus === "Disponível" || eq.operationalStatus === "Em Manutenção")
    );
  }, [equipmentList, selectedCustomerId, isLoadingEquipment]);

  useEffect(() => {
    if (!editingOrder) {
        if (selectedCustomerId) {
            const customer = customers.find(c => c.id === selectedCustomerId);
            if (customer?.preferredTechnician) {
                const preferredTech = technicians.find(t => t.name === customer.preferredTechnician);
                form.setValue('technicianId', preferredTech ? preferredTech.id : null, { shouldValidate: true });
            } else {
                form.setValue('technicianId', null, { shouldValidate: true });
            }
        } else {
             form.setValue('technicianId', null, { shouldValidate: true });
        }
    }

    if (selectedCustomerId) {
      if (selectedEquipmentId && !filteredEquipmentList.find(eq => eq.id === selectedEquipmentId)) {
        form.setValue('equipmentId', NO_EQUIPMENT_SELECTED_VALUE, { shouldValidate: true });
      }
    } else {
       if (selectedEquipmentId && !filteredEquipmentList.find(eq => eq.id === selectedEquipmentId)) {
        form.setValue('equipmentId', NO_EQUIPMENT_SELECTED_VALUE, { shouldValidate: true });
      }
    }
  }, [selectedCustomerId, customers, technicians, form, editingOrder, filteredEquipmentList, selectedEquipmentId]);


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
      });
      setShowCustomServiceType(!isServiceTypePredefined);
    } else {
      setEditingOrder(null);
      setIsEditMode(true); 
      const nextOrderNum = getNextOrderNumber(serviceOrders);
      form.reset({
        orderNumber: nextOrderNum,
        customerId: "", equipmentId: NO_EQUIPMENT_SELECTED_VALUE, phase: "Pendente", technicianId: null,
        requesterName: "", serviceType: "", customServiceType: "", vehicleId: null, description: "",
        notes: "", startDate: formatDateForInput(new Date().toISOString()), endDate: "",
        mediaUrls: [], technicalConclusion: null,
      });
      setShowCustomServiceType(false);
    }
    setIsModalOpen(true);
  }, [form, serviceOrders]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setMediaFiles([]);
    form.reset();
    setShowCustomServiceType(false);
    setIsConclusionModalOpen(false);
    setTechnicalConclusionText("");
    setIsEditMode(false);
  };

  const onSubmit = async (values: z.infer<typeof ServiceOrderSchema>) => {
    const existingUrlsToKeep = form.getValues('mediaUrls') || [];
    const newFilesToUpload = mediaFiles;
    const originalMediaUrls = editingOrder?.mediaUrls || [];

    if (editingOrder?.phase === 'Concluída' && editingOrder?.id) {
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
       if (window.confirm(`Tem certeza que deseja excluir a Ordem de Serviço "${editingOrder.orderNumber}"?`)) {
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
  
  const isOrderConcludedOrCancelled = editingOrder?.phase === 'Concluída' || editingOrder?.phase === 'Cancelada';
  const isMutating = addServiceOrderMutation.isPending || updateServiceOrderMutation.isPending || isUploadingFile || concludeServiceOrderMutation.isPending || deleteServiceOrderMutation.isPending;
  const isLoadingPageData = isLoadingServiceOrders || isLoadingCustomers || isLoadingEquipment || isLoadingTechnicians || isLoadingVehicles;

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
        <p className="text-sm mt-2">Detalhe: {errorServiceOrders?.message}</p>
      </div>
    );
  }

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || id;
  const getEquipmentIdentifier = (id: string) => {
    const eq = equipmentList.find(e => e.id === id);
    return eq ? `${eq.brand} ${eq.model} (Chassi: ${eq.chassisNumber})` : id;
  };
  const getTechnicianName = (id?: string | null) => {
    if (!id) return "Não Atribuído";
    return technicians.find(t => t.id === id)?.name || id;
  };
  const getVehicleIdentifier = (id?: string | null) => {
    if (!id) return "N/A";
    const vehicle = vehicles.find(v => v.id === id);
    return vehicle ? `${vehicle.model} (${vehicle.licensePlate})` : id;
  };

  return (
    <>
      <PageHeader
        title="Ordens de Serviço"
        actions={
          <Button onClick={() => openModal()} className="bg-primary hover:bg-primary/90" disabled={isMutating || deleteServiceOrderMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Criar Ordem de Serviço
          </Button>
        }
      />

      {serviceOrders.length === 0 && !isLoadingServiceOrders ? (
        <DataTablePlaceholder
          icon={ClipboardList}
          title="Nenhuma Ordem de Serviço Ainda"
          description="Crie sua primeira ordem de serviço para gerenciar as operações."
          buttonLabel="Criar Ordem de Serviço"
          onButtonClick={() => openModal()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {serviceOrders.map((order) => {
            const deadlineInfo = getDeadlineStatusInfo(order.endDate, order.phase);
            // console.log(`Order ${order.orderNumber} - EndDate: ${order.endDate}, Phase: ${order.phase}, DeadlineInfo:`, deadlineInfo);
            const cardClasses = cn(
              "flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer",
            );

            return (
            <Card key={order.id} className={cardClasses} onClick={() => openModal(order)} >
              {deadlineInfo.status !== 'none' && deadlineInfo.message && (
                 <div className={cn(
                  "p-2 text-sm font-medium rounded-t-md flex items-center justify-center",
                  deadlineInfo.alertClass // Apply the class string directly
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
                  {phaseIcons[order.phase]} <span className="font-medium text-muted-foreground ml-1 mr-1">Fase:</span> {order.phase}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow space-y-2 text-sm">
                <p className="flex items-center"><User className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Cliente:</span> {isLoadingCustomers ? 'Carregando...' : getCustomerName(order.customerId)}</p>
                {order.requesterName && (
                  <p className="flex items-start">
                    <User className="mr-2 mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                    <span className="font-medium text-muted-foreground mr-1">Solicitante:</span>
                    <span className="whitespace-pre-wrap break-words">{order.requesterName}</span>
                  </p>
                )}
                <p className="flex items-center"><Construction className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Equip.:</span> {isLoadingEquipment ? 'Carregando...' : getEquipmentIdentifier(order.equipmentId)}</p>
                <p className="flex items-center"><HardHat className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Técnico:</span> {isLoadingTechnicians ? 'Carregando...' : getTechnicianName(order.technicianId)}</p>
                {order.vehicleId && <p className="flex items-center"><VehicleIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Veículo:</span> {isLoadingVehicles ? 'Carregando...' : getVehicleIdentifier(order.vehicleId)}</p>}
                <p className="flex items-center"><Settings2 className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Tipo Serviço:</span> {order.serviceType}</p>
                {order.startDate && isValid(parseISO(order.startDate)) && <p className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Início:</span> {format(parseISO(order.startDate), 'dd/MM/yyyy')}</p>}
                {order.endDate && isValid(parseISO(order.endDate)) && <p className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-primary flex-shrink-0" /> <span className="font-medium text-muted-foreground mr-1">Conclusão Prev.:</span> {format(parseISO(order.endDate), 'dd/MM/yyyy', { locale: ptBR })}</p>}
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

                <FormField control={form.control} name="phase" render={({ field }) => (
                  <FormItem><FormLabel>Fase</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isOrderConcludedOrCancelled}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione a fase" /></SelectTrigger></FormControl>
                      <SelectContent>{phaseOptions.map(opt => <SelectItem key={opt} value={opt} disabled={opt === 'Concluída' && editingOrder?.phase !== 'Concluída'}>{opt}</SelectItem>)}</SelectContent>
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
                <p className="text-sm font-medium text-destructive mt-1">Limite de {MAX_FILES_ALLOWED} arquivos excedido.</p>
              )}
              <FormMessage />
            </FormItem>

            {editingOrder && !isOrderConcludedOrCancelled && editingOrder.phase !== 'Cancelada' && isEditMode && (
              <div className="pt-4">
                <Button type="button" variant="outline" onClick={handleOpenConclusionModal} disabled={isMutating} className="w-full sm:w-auto">
                  <Check className="mr-2 h-4 w-4" /> Concluir OS
                </Button>
              </div>
            )}

            {editingOrder && (isOrderConcludedOrCancelled || (editingOrder.phase === 'Concluída' && !isEditMode)) && (
              <FormField control={form.control} name="technicalConclusion" render={({ field }) => (
                <FormItem>
                  <FormLabel>Conclusão Técnica</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Nenhuma conclusão técnica registrada."
                      {...field}
                      value={field.value ?? ""}
                      readOnly
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            
            <fieldset disabled={(!!editingOrder && !isEditMode) || isOrderConcludedOrCancelled}>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Observações (Opcional)</FormLabel><FormControl><Textarea placeholder="Observações adicionais, peças utilizadas, etc." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>

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
    </>
  );
}

