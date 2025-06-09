
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { 
  Users, Construction, ClipboardList, HardHat, CarFront, SlidersHorizontal, 
  ArrowRight, PackageSearch, FileText, BarChart3, AlertTriangle, CheckCircle,
  DollarSign, Package, ListChecks, Wrench as WrenchIcon, TrendingUp, TrendingDown, Banknote
} from "lucide-react";
import { KPICard } from '@/components/dashboard/KPICard';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Maquina, Budget, ServiceOrder } from '@/types'; 
import { maquinaOperationalStatusOptions, budgetStatusOptions, serviceOrderPhaseOptions } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface MaquinaRentalKPIs {
  totalRentalValue: number;
  highestRentalMachine?: { name: string; value: number; id: string };
  lowestRentalMachine?: { name: string; value: number; id: string };
}

async function getMaquinaKPIs(): Promise<{
  total: number;
  disponivel: number;
  locada: number;
  manutencao: number;
  sucata: number;
} & MaquinaRentalKPIs> {
  if (!db) return { total: 0, disponivel: 0, locada: 0, manutencao: 0, sucata: 0, totalRentalValue: 0 };
  const maquinasSnapshot = await getDocs(collection(db, 'equipamentos'));
  const maquinas = maquinasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Maquina));
  
  let totalRentalValue = 0;
  let highestRentalMachine: { name: string; value: number; id: string } | undefined = undefined;
  let lowestRentalMachine: { name: string; value: number; id: string } | undefined = undefined;

  maquinas.forEach(m => {
    if (typeof m.monthlyRentalValue === 'number' && m.monthlyRentalValue > 0) {
      totalRentalValue += m.monthlyRentalValue;

      const machineName = `${m.brand} ${m.model} (${m.chassisNumber})`;

      if (!highestRentalMachine || m.monthlyRentalValue > highestRentalMachine.value) {
        highestRentalMachine = { name: machineName, value: m.monthlyRentalValue, id: m.id };
      }
      if (!lowestRentalMachine || m.monthlyRentalValue < lowestRentalMachine.value) {
        lowestRentalMachine = { name: machineName, value: m.monthlyRentalValue, id: m.id };
      }
    }
  });

  return {
    total: maquinas.length,
    disponivel: maquinas.filter(m => m.operationalStatus === 'Disponível').length,
    locada: maquinas.filter(m => m.operationalStatus === 'Locada').length,
    manutencao: maquinas.filter(m => m.operationalStatus === 'Em Manutenção').length,
    sucata: maquinas.filter(m => m.operationalStatus === 'Sucata').length,
    totalRentalValue,
    highestRentalMachine,
    lowestRentalMachine,
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


export default async function DashboardPage() {
  const maquinaKPIs = await getMaquinaKPIs();
  const budgetKPIs = await getBudgetKPIs();
  const serviceOrderKPIs = await getServiceOrderKPIs();

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
                title="Soma Mensal Aluguéis Máquinas"
                value={formatCurrency(maquinaKPIs.totalRentalValue)}
                icon={Banknote}
                iconColor="text-green-600"
                href="/maquinas"
            />
            {maquinaKPIs.highestRentalMachine && (
                <KPICard
                    title="Maior Aluguel Mensal"
                    value={formatCurrency(maquinaKPIs.highestRentalMachine.value)}
                    icon={TrendingUp}
                    iconColor="text-emerald-500"
                    additionalInfo={<span className="text-xs">{maquinaKPIs.highestRentalMachine.name}</span>}
                    href={`/maquinas?openMaquinaId=${maquinaKPIs.highestRentalMachine.id}`}
                />
            )}
            {maquinaKPIs.lowestRentalMachine && (
                <KPICard
                    title="Menor Aluguel Mensal"
                    value={formatCurrency(maquinaKPIs.lowestRentalMachine.value)}
                    icon={TrendingDown}
                    iconColor="text-amber-600"
                    additionalInfo={<span className="text-xs">{maquinaKPIs.lowestRentalMachine.name}</span>}
                    href={`/maquinas?openMaquinaId=${maquinaKPIs.lowestRentalMachine.id}`}
                />
            )}
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
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
