
import { z } from 'zod';
import { format, formatISO, parseISO, isValid as isValidDate } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { ptBR } from 'date-fns/locale';

// Placeholder constants to be used for schema validation checks
// These must match the values used for placeholder SelectItems in the client page
const NO_SERVICE_ORDER_SELECTED_VALUE_FOR_SCHEMA_CHECK = "_NO_OS_SELECTED_";
const NO_TECHNICIAN_SELECTED_VALUE_FOR_SCHEMA_CHECK = "_NO_TECHNICIAN_SELECTED_";


export interface Customer {
  id: string;
  name: string;
  fantasyName?: string | null;
  cnpj: string;
  email?: string | null;
  phone?: string;
  contactName?: string;
  cep?: string | null;
  street: string;
  number?: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  preferredTechnician?: string | null;
  notes?: string;
}

export const maquinaTypeOptions = [
  'Empilhadeira Contrabalançada GLP',
  'Empilhadeira Contrabalançada Elétrica',
  'Empilhadeira Retrátil',
  'Transpaleteira Elétrica',
] as const;

export const maquinaOperationalStatusOptions = ['Disponível', 'Locada', 'Em Manutenção', 'Sucata'] as const;

export type CompanyId = 'goldmaq' | 'goldcomercio' | 'goldjob';
export const companyIds = ["goldmaq", "goldcomercio", "goldjob"] as const;
export const GOLDMAQ_COMPANY_ID: CompanyId = 'goldmaq';


export const companyDisplayOptions: { id: CompanyId; name: string }[] = [
  { id: "goldmaq", name: "Gold Maq" },
  { id: "goldcomercio", name: "Gold Comércio" },
  { id: "goldjob", name: "Gold Empilhadeiras" },
];

export type OwnerReferenceType = CompanyId | 'CUSTOMER_OWNED';
export const OWNER_REF_CUSTOMER: OwnerReferenceType = 'CUSTOMER_OWNED';


export interface Maquina {
  id:string;
  brand: string;
  model: string;
  chassisNumber: string;
  fleetNumber?: string | null; // Novo campo
  equipmentType: typeof maquinaTypeOptions[number] | string;
  manufactureYear: number | null;
  operationalStatus: typeof maquinaOperationalStatusOptions[number];
  customerId?: string | null;
  ownerReference?: OwnerReferenceType | null;
  customBrand?: string;
  customEquipmentType?: string;

  towerOpenHeightMm?: number | null;
  towerClosedHeightMm?: number | null;
  nominalCapacityKg?: number | null;

  batteryBoxWidthMm?: number | null;
  batteryBoxHeightMm?: number | null;
  batteryBoxDepthMm?: number | null;

  monthlyRentalValue?: number | null;
  hourMeter?: number | null;
  notes?: string | null;
  partsCatalogUrl?: string | null;
  errorCodesUrl?: string | null;
  imageUrls?: string[] | null;
  linkedAuxiliaryEquipmentIds?: string[] | null;
}

export const serviceTypeOptionsList = [
  "Manutenção Preventiva",
  "Manutenção Corretiva",
  "Instalação",
  "Orçamento",
  "Visita Técnica",
  "Revisão Geral",
] as const;

export const serviceOrderPhaseOptions = [
  'Aguardando Avaliação Técnica',
  'Avaliado, Aguardando Autorização',
  'Autorizado, Aguardando Peça',
  'Em Execução',
  'Concluída',
  'Cancelada',
] as const;
export type ServiceOrderPhaseType = typeof serviceOrderPhaseOptions[number];


export interface ServiceOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  equipmentId: string;
  requesterName?: string | null;
  phase: ServiceOrderPhaseType;
  technicianId?: string | null;
  serviceType: string;
  customServiceType?: string;
  vehicleId?: string | null;
  startDate?: string;
  endDate?: string;
  description: string;
  notes?: string | null;
  mediaUrls?: string[] | null;
  technicalConclusion?: string | null;
  estimatedTravelDistanceKm?: number | null;
  estimatedTollCosts?: number | null;
  estimatedTravelCost?: number | null;
  machineStatusBeforeOs?: typeof maquinaOperationalStatusOptions[number] | null; // Added field
}

export const roleOptionsList = [
  "Técnico", "Administrativo", "Gerência", "Fiscal",
  "Financeiro", "Compras", "Vendas", "Comercial"
] as const;

export interface Technician {
  id: string;
  name: string;
  role: typeof roleOptionsList[number] | string;
  specialization?: string;
  phone?: string;
  imageUrl?: string | null; // Added field for technician profile image URL
}

export interface Company {
  id: CompanyId;
  name: string;
  cnpj: string;
  street: string;
  number?: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;
  bankPixKey?: string;
}

export interface FuelingRecord {
  id: string;
  date: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  mileageAtFueling: number;
  fuelStation?: string | null;
  notes?: string | null;
}

export interface VehicleMaintenanceRecord {
  id: string;
  date: string;
  description: string;
  cost: number;
  mileageAtMaintenance: number;
  serviceProvider?: string | null;
  notes?: string | null;
}

export interface Vehicle {
  id: string;
  model: string;
  licensePlate: string;
  kind: string;
  currentMileage: number;
  fuelConsumption: number;
  costPerKilometer: number;
  fipeValue?: number | null;
  year?: number | null;
  registrationInfo?: string;
  status: 'Disponível' | 'Em Uso' | 'Manutenção';
  fuelingHistory?: FuelingRecord[] | null;
  maintenanceHistory?: VehicleMaintenanceRecord[] | null;
  nextMaintenanceType?: 'km' | 'date' | null;
  nextMaintenanceKm?: number | null;
  nextMaintenanceDate?: string | null; // ISO date string 'yyyy-MM-dd'
  maintenanceNotes?: string | null;
  imageUrls?: string[] | null; // Added field for vehicle images
}

export const auxiliaryEquipmentTypeOptions = ["Bateria", "Carregador", "Berço", "Cabo"] as const;
export const auxiliaryEquipmentStatusOptions = ['Disponível', 'Locado', 'Em Manutenção', 'Sucata'] as const;

export interface AuxiliaryEquipment {
  id: string;
  name: string;
  type: typeof auxiliaryEquipmentTypeOptions[number] | string;
  customType?: string;
  serialNumber?: string | null;
  status: typeof auxiliaryEquipmentStatusOptions[number];
  linkedEquipmentId?: string | null;
  notes?: string | null;
  imageUrls?: string[] | null;
}

export const budgetStatusOptions = [
  "Pendente", "Enviado", "Aprovado", "Recusado", "Cancelado"
] as const;
export type BudgetStatusType = typeof budgetStatusOptions[number];

export interface BudgetItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
}

export interface Budget {
  id: string;
  budgetNumber: string;
  serviceOrderId: string;
  customerId: string;
  equipmentId: string;
  status: BudgetStatusType;
  items: BudgetItem[];
  shippingCost?: number | null;
  subtotal?: number;
  totalAmount?: number;
  createdDate: string;
  validUntilDate?: string | null;
  notes?: string | null;
  serviceOrderCreated?: boolean | null;
}

// --- Requisição de Peças ---
export const partsRequisitionStatusOptions = [
  "Pendente", "Triagem Realizada", "Atendida Parcialmente", "Atendida Totalmente", "Cancelada"
] as const;
export type PartsRequisitionStatusType = typeof partsRequisitionStatusOptions[number];

export const partsRequisitionItemStatusOptions = [
  "Pendente Aprovação", "Aprovado", "Recusado", "Aguardando Compra", "Separado", "Entregue"
] as const;
export type PartsRequisitionItemStatusType = typeof partsRequisitionItemStatusOptions[number];

export interface PartsRequisitionItem {
  id: string; // UUID
  partName: string;
  quantity: number;
  notes?: string | null;
  imageUrl?: string | null;
  status: PartsRequisitionItemStatusType;
  triageNotes?: string | null;
  warehouseNotes?: string | null;
  estimatedCost?: number | null;
}

export interface PartsRequisition {
  id: string;
  requisitionNumber: string;
  serviceOrderId: string;
  technicianId: string;
  technicianName?: string;
  createdDate: string;
  status: PartsRequisitionStatusType;
  items: PartsRequisitionItem[];
  generalNotes?: string | null;
}

const requiredString = (field: string) => z.string().min(1, `${field} é obrigatório.`);

// Helper para formatar data para yyyy-MM-dd ANTES da validação/transformação de Zod
// Zod espera string para inputs de data, e então podemos transformar/validar.
const formatDateForInputHelper = (dateValue: any): string | null => {
  if (!dateValue) return null;
  let d: Date;
  if (dateValue instanceof Timestamp) {
    d = dateValue.toDate();
  } else if (typeof dateValue === 'string') {
    d = parseISO(dateValue);
  } else if (dateValue instanceof Date) {
    d = dateValue;
  } else {
    return null;
  }
  if (!isValidDate(d)) return null;
  return format(d, 'yyyy-MM-dd');
};


export const CustomerSchema = z.object({
  name: requiredString("Nome (Razão Social)"),
  fantasyName: z.string().optional().nullable(),
  cnpj: requiredString("CNPJ"),
  email: z.string().email("Endereço de email inválido").optional().nullable(),
  phone: z.string().optional().transform(val => val ? val.replace(/\D/g, '') : undefined),
  contactName: z.string().optional(),
  cep: z.string()
    .refine(val => !val || /^\d{5}-?\d{3}$/.test(val), { message: "CEP inválido. Use o formato XXXXX-XXX ou XXXXXXXX." })
    .optional()
    .nullable()
    .transform(val => val ? val.replace(/\D/g, '') : null)
    .transform(val => val && val.length === 8 ? `${val.slice(0,5)}-${val.slice(5)}` : val),
  street: requiredString("Rua"),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: requiredString("Bairro"),
  city: requiredString("Cidade"),
  state: z.string().length(2, "UF deve ter 2 caracteres").min(2, "UF é obrigatória e deve ter 2 caracteres"),
  preferredTechnician: z.string().nullable().optional(),
  notes: z.string().optional(),
});

const ownerReferenceSchema = z.union([
  z.enum(companyIds),
  z.literal(OWNER_REF_CUSTOMER),
]);

export const MaquinaSchema = z.object({
  brand: requiredString("Marca"),
  model: requiredString("Modelo"),
  chassisNumber: requiredString("Número do chassi"),
  fleetNumber: z.string().optional().nullable(),
  equipmentType: requiredString("Tipo de máquina"),
  manufactureYear: z.coerce.number().min(1900, "Ano inválido").max(new Date().getFullYear() + 1, "Ano inválido").nullable(),
  operationalStatus: z.enum(maquinaOperationalStatusOptions),
  customerId: z.string().nullable().optional(),
  ownerReference: ownerReferenceSchema.nullable().optional(),
  customBrand: z.string().optional(),
  customEquipmentType: z.string().optional(),
  towerOpenHeightMm: z.coerce.number().positive("Deve ser positivo").optional().nullable(),
  towerClosedHeightMm: z.coerce.number().positive("Deve ser positivo").optional().nullable(),
  nominalCapacityKg: z.coerce.number().positive("Deve ser positivo").optional().nullable(),
  batteryBoxWidthMm: z.coerce.number().positive("Deve ser positivo").optional().nullable(),
  batteryBoxHeightMm: z.coerce.number().positive("Deve ser positivo").optional().nullable(),
  batteryBoxDepthMm: z.coerce.number().positive("Deve ser positivo").optional().nullable(),
  monthlyRentalValue: z.coerce.number().min(0, "Valor deve ser positivo ou zero").optional().nullable(),
  hourMeter: z.coerce.number().min(0, "Horímetro deve ser positivo ou zero").optional().nullable(),
  notes: z.string().optional().nullable(),
  partsCatalogUrl: z.string().url("URL inválida para catálogo de peças").nullable().optional(),
  errorCodesUrl: z.string().url("URL inválida para códigos de erro").nullable().optional(),
  linkedAuxiliaryEquipmentIds: z.array(z.string()).optional().nullable(),
  imageUrls: z.array(z.string().url("URL de imagem inválida"))
    .max(5, "Máximo de 5 imagens por máquina")
    .nullable()
    .optional(),
}).refine(data => {
  if (data.ownerReference === OWNER_REF_CUSTOMER && !data.customerId) {
    return false;
  }
  return true;
}, {
  message: "Um cliente deve ser selecionado se a propriedade for definida como 'Cliente Vinculado'.",
  path: ["customerId"],
});


export const TechnicianSchema = z.object({
  name: requiredString("Nome"),
  role: requiredString("Cargo"),
  specialization: z.string().optional(),
  phone: z.string().optional().transform(val => val ? val.replace(/\D/g, '') : undefined),
  imageUrl: z.string().url("URL da imagem de perfil inválida.").optional().nullable(),
});

export const FuelingRecordSchema = z.object({
  id: z.string().uuid("ID inválido").optional(),
  date: z.string().refine((val) => {
    try {
      return !!parseISO(val);
    } catch (e) {
      return false;
    }
  }, "Data inválida").transform((val) => formatISO(parseISO(val), { representation: 'date' })),
  liters: z.coerce.number().positive("Litros devem ser um número positivo."),
  pricePerLiter: z.coerce.number().positive("Preço por litro deve ser um número positivo."),
  totalCost: z.coerce.number().positive("Custo total deve ser um número positivo.").optional(),
  mileageAtFueling: z.coerce.number().int().min(0, "Quilometragem deve ser um número positivo."),
  fuelStation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const VehicleMaintenanceRecordSchema = z.object({
  id: z.string().uuid("ID inválido").optional(),
  date: z.string().refine((val) => {
    try {
      return !!parseISO(val);
    } catch (e) {
      return false;
    }
  }, "Data inválida").transform((val) => formatISO(parseISO(val), { representation: 'date' })),
  description: requiredString("Descrição da manutenção"),
  cost: z.coerce.number().min(0, "Custo deve ser um número não negativo."),
  mileageAtMaintenance: z.coerce.number().int().min(0, "Quilometragem deve ser um número não negativo."),
  serviceProvider: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const VehicleSchema = z.object({
  model: requiredString("Modelo"),
  licensePlate: requiredString("Placa"),
  kind: requiredString("Tipo de veículo"),
  currentMileage: z.coerce.number().min(0, "Quilometragem deve ser um número não negativo"),
  fuelConsumption: z.coerce.number().min(0, "Consumo de combustível deve ser um número não negativo"),
  costPerKilometer: z.coerce.number().min(0, "Custo por quilômetro deve ser um número não negativo"),
  fipeValue: z.coerce.number().min(0, "Valor FIPE deve ser um número não negativo").optional().nullable(),
  year: z.coerce.number().min(1900, "Ano inválido").max(new Date().getFullYear() + 1, "Ano inválido").nullable().optional(),
  registrationInfo: z.string().optional(),
  status: z.enum(['Disponível', 'Em Uso', 'Manutenção']),
  fuelingHistory: z.array(FuelingRecordSchema).optional().nullable(),
  maintenanceHistory: z.array(VehicleMaintenanceRecordSchema).optional().nullable(),
  nextMaintenanceType: z.enum(['km', 'date']).nullable().optional(),
  nextMaintenanceKm: z.coerce.number().min(0, "KM da próxima manutenção deve ser não negativo.").nullable().optional(),
  nextMaintenanceDate: z.string()
    .nullable()
    .optional()
    .refine(val => !val || isValidDate(parseISO(val)), { message: "Data inválida." })
    .transform(val => val ? formatDateForInputHelper(val) : null),
  maintenanceNotes: z.string().optional().nullable(),
  imageUrls: z.array(z.string().url("URL de imagem inválida"))
    .max(2, "Máximo de 2 imagens por veículo")
    .nullable()
    .optional(),
}).refine(data => {
  if (data.nextMaintenanceType === 'km' && (data.nextMaintenanceKm === null || data.nextMaintenanceKm === undefined)) {
    return false;
  }
  if (data.nextMaintenanceType === 'date' && (!data.nextMaintenanceDate)) {
    return false;
  }
  return true;
}, {
  message: "Especifique o valor (KM ou Data) para o tipo de alerta selecionado.",
  path: ["nextMaintenanceKm"],
});


export const CompanySchema = z.object({
  id: z.enum(companyIds),
  name: requiredString("Nome da empresa"),
  cnpj: requiredString("CNPJ"),
  street: requiredString("Rua"),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: requiredString("Bairro"),
  city: requiredString("Cidade"),
  state: z.string().length(2, "UF deve ter 2 caracteres").min(2, "UF é obrigatória"),
  cep: requiredString("CEP").regex(/^\d{5}-?\d{3}$/, "CEP inválido. Use XXXXX-XXX."),
  phone: z.string().optional().transform(val => val ? val.replace(/\D/g, '') : undefined),
  email: z.string().email("Email inválido").optional(),
  bankName: z.string().optional().nullable().transform(val => val || undefined),
  bankAgency: z.string().optional().nullable().transform(val => val || undefined),
  bankAccount: z.string().optional().nullable().transform(val => val || undefined),
  bankPixKey: z.string().optional().nullable().transform(val => val || undefined),
});

export const AuxiliaryEquipmentSchema = z.object({
  name: requiredString("Nome do equipamento auxiliar"),
  type: requiredString("Tipo"),
  customType: z.string().optional(),
  serialNumber: z.string().optional().nullable(),
  status: z.enum(auxiliaryEquipmentStatusOptions, { required_error: "Status é obrigatório" }),
  notes: z.string().optional().nullable(),
  imageUrls: z.array(z.string().url("URL de imagem inválida"))
    .max(5, "Máximo de 5 imagens por equipamento auxiliar")
    .nullable()
    .optional(),
}).refine(data => {
  if (data.type === '_CUSTOM_' && (!data.customType || data.customType.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Por favor, especifique o tipo customizado.",
  path: ["customType"],
});


export const BudgetItemSchema = z.object({
  id: z.string().min(1, "ID do item é obrigatório (normalmente UUID)"),
  description: requiredString("Descrição do item"),
  quantity: z.coerce.number().min(0.01, "Quantidade deve ser maior que zero"),
  unitPrice: z.coerce.number().min(0, "Preço unitário não pode ser negativo"),
  totalPrice: z.coerce.number().optional(),
});

export const BudgetSchema = z.object({
  budgetNumber: requiredString("Número do Orçamento"),
  serviceOrderId: requiredString("Ordem de Serviço"),
  customerId: requiredString("Cliente"),
  equipmentId: requiredString("Equipamento"),
  status: z.enum(budgetStatusOptions, { required_error: "Status do orçamento é obrigatório" }),
  items: z.array(BudgetItemSchema).min(1, "Orçamento deve ter pelo menos um item"),
  shippingCost: z.coerce.number().min(0, "Custo de frete não pode ser negativo").optional().nullable(),
  subtotal: z.coerce.number().optional(),
  totalAmount: z.coerce.number().optional(),
  createdDate: z.string().refine(val => isValidDate(parseISO(val)), "Data de criação inválida"),
  validUntilDate: z.string().optional().nullable().refine(val => !val || isValidDate(parseISO(val)), "Data de validade inválida"),
  notes: z.string().optional().nullable(),
  serviceOrderCreated: z.boolean().optional().nullable(),
});

// --- Requisição de Peças Schemas ---
export const PartsRequisitionItemSchema = z.object({
  id: z.string().uuid("ID do item deve ser um UUID válido."),
  partName: requiredString("Nome da peça"),
  quantity: z.coerce.number().int().min(1, "Quantidade deve ser pelo menos 1."),
  notes: z.string().optional().nullable(),
  imageUrl: z.string().url("URL da imagem inválida.").optional().nullable(),
  status: z.enum(partsRequisitionItemStatusOptions, { required_error: "Status do item é obrigatório."}),
  triageNotes: z.string().optional().nullable(),
  warehouseNotes: z.string().optional().nullable(),
  estimatedCost: z.coerce.number().min(0, "Custo estimado não pode ser negativo.").optional().nullable(),
});

export const PartsRequisitionSchema = z.object({
  id: z.string().uuid("ID da requisição deve ser um UUID válido.").optional(),
  requisitionNumber: requiredString("Número da Requisição"),
  serviceOrderId: requiredString("Ordem de Serviço vinculada")
    .refine(val => val !== NO_SERVICE_ORDER_SELECTED_VALUE_FOR_SCHEMA_CHECK, {
      message: "Selecione uma Ordem de Serviço válida.",
    }),
  technicianId: requiredString("Técnico solicitante")
    .refine(val => val !== NO_TECHNICIAN_SELECTED_VALUE_FOR_SCHEMA_CHECK, {
      message: "Selecione um Técnico válido.",
    }),
  technicianName: z.string().optional(),
  createdDate: z.string().refine(val => isValidDate(parseISO(val)), "Data de criação inválida.").optional(),
  status: z.enum(partsRequisitionStatusOptions, { required_error: "Status da requisição é obrigatório."}),
  items: z.array(PartsRequisitionItemSchema).min(1, "A requisição deve ter pelo menos uma peça."),
  generalNotes: z.string().optional().nullable(),
});

export const ServiceOrderSchema = z.object({
  orderNumber: requiredString("Número da ordem"),
  customerId: requiredString("Cliente"),
  equipmentId: requiredString("Máquina"),
  requesterName: z.string().optional().nullable(),
  phase: z.enum(serviceOrderPhaseOptions),
  technicianId: z.string().nullable().optional(),
  serviceType: requiredString("Tipo de serviço"),
  customServiceType: z.string().optional(),
  vehicleId: z.string().nullable().optional(),
  startDate: z.string().optional().refine(val => !val || isValidDate(parseISO(val)), "Data de início inválida"),
  endDate: z.string().optional().refine(val => !val || isValidDate(parseISO(val)), "Data de conclusão inválida"),
  description: requiredString("Problema relatado"),
  notes: z.string().optional().nullable(),
  mediaUrls: z.array(z.string().url("URL de mídia inválida")).max(5, "Máximo de 5 arquivos de mídia").nullable().optional(),
  technicalConclusion: z.string().nullable().optional(),
  estimatedTravelDistanceKm: z.coerce.number().min(0, "Distância deve ser positiva ou zero").optional().nullable(),
  estimatedTollCosts: z.coerce.number().min(0, "Custo de pedágio deve ser positivo ou zero").optional().nullable(),
  estimatedTravelCost: z.coerce.number().min(0, "Custo de viagem deve ser positivo ou zero").optional().nullable(),
  machineStatusBeforeOs: z.enum(maquinaOperationalStatusOptions).nullable().optional(),
}).refine(data => {
  if (data.serviceType === '_CUSTOM_' && (!data.customServiceType || data.customServiceType.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Por favor, especifique o tipo de serviço customizado.",
  path: ["customServiceType"],
});

    
