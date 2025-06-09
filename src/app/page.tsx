
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { 
  Users, Construction, ClipboardList, HardHat, CarFront, SlidersHorizontal, 
  ArrowRight, PackageSearch, FileText, BarChart3, AlertTriangle, CheckCircle,
  DollarSign, Package, ListChecks, Wrench as WrenchIcon
} from "lucide-react";
import { KPICard } from '@/components/dashboard/KPICard';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Maquina, Budget, ServiceOrder, Vehicle } from '@/types'; // Added Vehicle
import { maquinaOperationalStatusOptions, budgetStatusOptions, serviceOrderPhaseOptions } from '@/types';
import { formatCurrency } from '@/lib/utils';

const quickLinks = [
  { title: "Clientes", href: "/customers", icon: Users, description: "Gerenciar informações de clientes" },
  { title: "Máquinas", href: "/maquinas", icon: Construction, description: "Rastrear máquinas e equipamentos" },
  { title: "Equip. Auxiliares", href: "/auxiliary-equipment", icon: PackageSearch, description: "Controlar baterias, carregadores, etc." },
  { title: "Ordens de Serviço", href: "/service-orders", icon: ClipboardList, description: "Supervisionar operações de serviço" },
  { title: "Orçamentos", href: "/budgets", icon: FileText, description: "Criar e gerenciar orçamentos" },
  { title: "Requisições Peças", href: "/parts-requisitions", icon: WrenchIcon, description: "Requisições de peças pelos técnicos" },
  { title: "Triagem de Ordens e Peças", href: "/parts-triage", icon: ListChecks, description: "Aprovar peças e processar orçamentos" },
  { title: "Almoxarifado Peças", href: "/parts-warehouse", icon: Package, description: "Separar e controlar custos de peças" },
  { title: "Técnicos / Colaboradores", href: "/technicians", icon: HardHat, description: "Manter registro de colaboradores" },
  { title: "Veículos", href: "/vehicles", icon: CarFront, description: "Administrar dados de veículos" },
  { title: "Dados das Empresas", href: "/company-config", icon: SlidersHorizontal, description: "Definir detalhes das empresas do grupo" },
];

async function getMaquinaKPIs() {
  if (!db) return { total: 0, disponivel: 0, locada: 0, manutencao: 0, sucata: 0 };
  const maquinasSnapshot = await getDocs(collection(db, 'equipamentos'));
  const maquinas = maquinasSnapshot.docs.map(doc => doc.data() as Maquina);
  
  return {
    total: maquinas.length,
    disponivel: maquinas.filter(m => m.operationalStatus === 'Disponível').length,
    locada: maquinas.filter(m => m.operationalStatus === 'Locada').length,
    manutencao: maquinas.filter(m => m.operationalStatus === 'Em Manutenção').length,
    sucata: maquinas.filter(m => m.operationalStatus === 'Sucata').length,
  };
}

async function getBudgetKPIs() {
  if (!db) return { pendingCount: 0, pendingValue: 0, approvedCount: 0, approvedValue: 0 };
  const budgetsSnapshot = await getDocs(collection(db, 'budgets'));
  const budgets = budgetsSnapshot.docs.map(doc => doc.data() as Budget);

  const pendingBudgets = budgets.filter(b => b.status === 'Pendente' || b.status === 'Enviado');
  const approvedBudgets = budgets.filter(b => b.status === 'Aprovado');

  return {
    pendingCount: pendingBudgets.length,
    pendingValue: pendingBudgets.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
    approvedCount: approvedBudgets.length,
    approvedValue: approvedBudgets.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
  };
}

async function getServiceOrderKPIs() {
  if (!db) return { openCount: 0 };
  const serviceOrdersSnapshot = await getDocs(collection(db, 'ordensDeServico'));
  const serviceOrders = serviceOrdersSnapshot.docs.map(doc => doc.data() as ServiceOrder);

  const openOrders = serviceOrders.filter(
    os => os.phase !== 'Concluída' && os.phase !== 'Cancelada'
  );
  
  return {
    openCount: openOrders.length,
  };
}

async function getVehicleKPIs() {
  if (!db) return { totalFipeValue: 0, vehicleCount: 0 };
  const vehiclesSnapshot = await getDocs(collection(db, 'veiculos'));
  const vehicles = vehiclesSnapshot.docs.map(doc => doc.data() as Vehicle);

  const totalFipeValue = vehicles.reduce((sum, v) => sum + (v.fipeValue || 0), 0);
  
  return {
    totalFipeValue: totalFipeValue,
    vehicleCount: vehicles.length,
  };
}


export default async function DashboardPage() {
  const maquinaKPIs = await getMaquinaKPIs();
  const budgetKPIs = await getBudgetKPIs();
  const serviceOrderKPIs = await getServiceOrderKPIs();
  const vehicleKPIs = await getVehicleKPIs();

  return (
    <AppLayout>
      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-headline font-semibold mb-4">Indicadores Chave</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            <KPICard 
              title="Total de Máquinas" 
              value={maquinaKPIs.total} 
              icon={Construction}
              href="/maquinas"
            />
            <KPICard 
              title="Máquinas Disponíveis" 
              value={maquinaKPIs.disponivel} 
              icon={CheckCircle} 
              iconColor="text-green-500"
              href="/maquinas?status=Disponível"
            />
            <KPICard 
              title="Máquinas Locadas" 
              value={maquinaKPIs.locada} 
              icon={PackageSearch} 
              iconColor="text-blue-500"
              href="/maquinas?status=Locada"
            />
            <KPICard 
              title="Máquinas em Manutenção" 
              value={maquinaKPIs.manutencao} 
              icon={WrenchIcon} 
              iconColor="text-yellow-500"
              href="/maquinas?status=Em Manutenção"
            />
             <KPICard 
              title="Orçamentos Pendentes" 
              value={budgetKPIs.pendingCount} 
              icon={FileText} 
              iconColor="text-yellow-500"
              additionalInfo={<span className="text-sm font-semibold">{formatCurrency(budgetKPIs.pendingValue)}</span>}
              href="/budgets?status=Pendente"
            />
            <KPICard 
              title="Orçamentos Aprovados" 
              value={budgetKPIs.approvedCount} 
              icon={DollarSign} 
              iconColor="text-green-500"
              additionalInfo={<span className="text-sm font-semibold">{formatCurrency(budgetKPIs.approvedValue)}</span>}
              href="/budgets?status=Aprovado"
            />
            <KPICard 
              title="Ordens de Serviço Abertas" 
              value={serviceOrderKPIs.openCount} 
              icon={ClipboardList} 
              iconColor="text-orange-500"
              href="/service-orders?status=Abertas"
            />
            <KPICard
              title="Valor Total da Frota (FIPE)"
              value={formatCurrency(vehicleKPIs.totalFipeValue)}
              icon={CarFront}
              iconColor="text-indigo-500"
              additionalInfo={<span className="text-sm">{vehicleKPIs.vehicleCount} veículos</span>}
              href="/vehicles"
            />
          </div>
        </section>

        <section>
          <h2 className="text-xl font-headline font-semibold mb-4">Acesso Rápido</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quickLinks.map((link) => (
              <Card key={link.title} className="hover:shadow-xl transition-shadow duration-300">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg font-medium font-headline">{link.title}</CardTitle>
                  <link.icon className="w-6 h-6 text-primary" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">{link.description}</p>
                  <Button asChild variant="outline" size="sm" className="w-full group">
                    <Link href={link.href}>
                      Ir para {link.title}
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
