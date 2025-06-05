
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Users, Construction, ClipboardList, HardHat, CarFront, SlidersHorizontal, ArrowRight, PackageSearch } from "lucide-react";

const quickLinks = [
  { title: "Clientes", href: "/customers", icon: Users, description: "Gerenciar informações de clientes" },
  { title: "Equipamentos", href: "/equipment", icon: Construction, description: "Rastrear equipamentos de empilhadeira" },
  { title: "Equip. Auxiliares", href: "/auxiliary-equipment", icon: PackageSearch, description: "Controlar baterias, carregadores, etc." },
  { title: "Ordens de Serviço", href: "/service-orders", icon: ClipboardList, description: "Supervisionar operações de serviço" },
  { title: "Técnicos", href: "/technicians", icon: HardHat, description: "Manter registro de técnicos" },
  { title: "Veículos", href: "/vehicles", icon: CarFront, description: "Administrar dados de veículos" },
  { title: "Config. das Empresas", href: "/company-config", icon: SlidersHorizontal, description: "Definir detalhes das empresas do grupo" },
];

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="space-y-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Bem-vindo ao Gold Maq</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Seu hub central para gerenciar clientes, equipamentos, ordens de serviço e mais.
              Use a navegação à esquerda ou os links rápidos abaixo para começar.
            </p>
          </CardContent>
        </Card>

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
