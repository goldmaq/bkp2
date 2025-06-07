
export interface Customer {
  id: string;
  name: string;
  cnpj: string;
  email: string;
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


export interface ServiceOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  equipmentId: string; // This ID refers to a 'Maquina' entity
  requesterName?: string | null; // Nome do solicitante do serviço
  phase: 'Pendente' | 'Em Progresso' | 'Aguardando Peças' | 'Concluída' | 'Cancelada';
  technicianId?: string | null;
  serviceType: string;
  customServiceType?: string;
  vehicleId?: string | null;
  startDate?: string;
  endDate?: string;
  description: string;
  notes?: string | null;
  mediaUrls?: string[] | null; // Array de URLs de mídia (fotos/vídeos)
  technicalConclusion?: string | null;
}

export interface Technician {
  id: string;
  name: string;
  employeeId: string;
  specialization?: string;
  phone?: string;
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
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;
  bankPixKey?: string;
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
  registrationInfo?: string;
  status: 'Disponível' | 'Em Uso' | 'Manutenção';
}

export const auxiliaryEquipmentTypeOptions = ["Bateria", "Carregador", "Berço", "Cabo"] as const;
export const auxiliaryEquipmentStatusOptions = ['Disponível', 'Locado', 'Em Manutenção', 'Sucata'] as const;

export interface AuxiliaryEquipment {
  id: string;
  name: string; // Ex: "Bateria Tracionária 80V Modelo X"
  type: typeof auxiliaryEquipmentTypeOptions[number] | string; // "Bateria", "Carregador", "Berço", "Outro"
  customType?: string; // Se type for "Outro"
  serialNumber?: string | null;
  status: typeof auxiliaryEquipmentStatusOptions[number];
  linkedEquipmentId?: string | null; // ID da máquina principal (Maquina) - AINDA NECESSÁRIO PARA LEITURA/EXIBIÇÃO
  notes?: string | null;
}


import { z } from 'zod';

export const CustomerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  cnpj: z.string().min(1, "CNPJ é obrigatório"),
  email: z.string().email("Endereço de email inválido"),
  phone: z.string().optional(),
  contactName: z.string().optional(),
  cep: z.string()
    .refine(val => !val || /^\d{5}-?\d{3}$/.test(val), { message: "CEP inválido. Use o formato XXXXX-XXX ou XXXXXXXX." })
    .optional()
    .nullable()
    .transform(val => val ? val.replace(/\D/g, '') : null)
    .transform(val => val && val.length === 8 ? `${val.slice(0,5)}-${val.slice(5)}` : val),
  street: z.string().min(1, "Rua é obrigatória"),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().min(1, "Bairro é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  state: z.string().length(2, "UF deve ter 2 caracteres").min(2, "UF é obrigatória e deve ter 2 caracteres"),
  preferredTechnician: z.string().nullable().optional(),
  notes: z.string().optional(),
});

const ownerReferenceSchema = z.union([
  z.enum(companyIds),
  z.literal(OWNER_REF_CUSTOMER),
]);

export const MaquinaSchema = z.object({
  brand: z.string().min(1, "Marca é obrigatória"),
  model: z.string().min(1, "Modelo é obrigatório"),
  chassisNumber: z.string().min(1, "Número do chassi é obrigatório"),
  equipmentType: z.string().min(1, "Tipo de máquina é obrigatório"),
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
  auxiliaryEquipmentIds: z.array(z.string()).optional().nullable(), // Este é o campo para o formulário da máquina
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
  name: z.string().min(1, "Nome é obrigatório"),
  employeeId: z.string().min(1, "Matrícula é obrigatória"),
  specialization: z.string().optional(),
  phone: z.string().optional(),
});

export const VehicleSchema = z.object({
  model: z.string().min(1, "Modelo é obrigatório"),
  licensePlate: z.string().min(1, "Placa é obrigatória"),
  kind: z.string().min(1, "Tipo de veículo é obrigatório"),
  currentMileage: z.coerce.number().min(0, "Quilometragem deve ser positiva"),
  fuelConsumption: z.coerce.number().min(0, "Consumo de combustível deve ser positivo"),
  costPerKilometer: z.coerce.number().min(0, "Custo por quilômetro deve ser positivo"),
  fipeValue: z.coerce.number().min(0, "Valor FIPE deve ser positivo ou zero").optional().nullable(),
  registrationInfo: z.string().optional(),
  status: z.enum(['Disponível', 'Em Uso', 'Manutenção']),
});

export const ServiceOrderSchema = z.object({
  orderNumber: z.string().min(1, "Número da ordem é obrigatório"),
  customerId: z.string().min(1, "Cliente é obrigatório"),
  equipmentId: z.string().min(1, "Máquina é obrigatória"),
  requesterName: z.string().optional().nullable(),
  phase: z.enum(['Pendente', 'Em Progresso', 'Aguardando Peças', 'Concluída', 'Cancelada']),
  technicianId: z.string().nullable().optional(),
  serviceType: z.string().min(1, "Tipo de serviço é obrigatório"),
  customServiceType: z.string().optional(),
  vehicleId: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().min(1, "Problema relatado é obrigatório"),
  notes: z.string().optional().nullable(),
  mediaUrls: z.array(z.string().url("URL de mídia inválida")).max(5, "Máximo de 5 arquivos de mídia").nullable().optional(),
  technicalConclusion: z.string().nullable().optional(),
}).refine(data => {
  if (data.serviceType === '_CUSTOM_' && (!data.customServiceType || data.customServiceType.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Por favor, especifique o tipo de serviço customizado.",
  path: ["customServiceType"],
});


export const CompanySchema = z.object({
  name: z.string().min(1, "Nome da empresa é obrigatório"),
  cnpj: z.string().min(1, "CNPJ é obrigatório"),
  street: z.string().min(1, "Rua é obrigatória"),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().min(1, "Bairro é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  state: z.string().length(2, "UF deve ter 2 caracteres").min(2, "UF é obrigatória"),
  cep: z.string().min(1, "CEP é obrigatório").regex(/^\d{5}-?\d{3}$/, "CEP inválido. Use XXXXX-XXX."),
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
  bankPixKey: z.string().optional(),
});

export const AuxiliaryEquipmentSchema = z.object({
  name: z.string().min(1, "Nome do equipamento auxiliar é obrigatório"),
  type: z.string().min(1, "Tipo é obrigatório"),
  customType: z.string().optional(),
  serialNumber: z.string().optional().nullable(),
  status: z.enum(auxiliaryEquipmentStatusOptions, { required_error: "Status é obrigatório" }),
  // linkedEquipmentId foi removido deste schema, pois não será definido por este formulário
  notes: z.string().optional().nullable(),
}).refine(data => {
  if (data.type === '_CUSTOM_' && (!data.customType || data.customType.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Por favor, especifique o tipo customizado.",
  path: ["customType"],
});

