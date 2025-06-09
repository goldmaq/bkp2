
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Construction,
  ClipboardList,
  HardHat,
  CarFront,
  SlidersHorizontal,
  Settings,
  PackageSearch,
  FileText,
  Wrench, 
  ClipboardCheck, 
  Archive, 
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BackToTopButton } from "@/components/shared/BackToTopButton";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const navItems: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Painel" },
  { href: "/customers", icon: Users, label: "Clientes" },
  { href: "/maquinas", icon: Construction, label: "Máquinas" },
  { href: "/auxiliary-equipment", icon: PackageSearch, label: "Equip. Auxiliares" },
  { href: "/service-orders", icon: ClipboardList, label: "Ordens de Serviço" },
  { href: "/budgets", icon: FileText, label: "Orçamentos" },
  { href: "/parts-requisitions", icon: Wrench, label: "Requisições Peças" },
  { href: "/parts-triage", icon: ClipboardCheck, label: "Triagem de Ordens e Peças" },
  { href: "/parts-warehouse", icon: Archive, label: "Almoxarifado Peças" },
  { href: "/technicians", icon: HardHat, label: "Técnicos / Colaboradores" },
  { href: "/vehicles", icon: CarFront, label: "Veículos" },
  { href: "/company-config", icon: SlidersHorizontal, label: "Dados das Empresas" },
];

const appVersion = "5.2.0"; 

function MainSidebar() {
  const pathname = usePathname();
  const { open } = useSidebar();

  return (
    <Sidebar
      variant="sidebar"
      collapsible={open ? "icon" : "offcanvas"}
      className="shadow-lg"
    >
      <SidebarHeader className="p-4 border-b border-sidebar-border flex justify-center items-center h-16">
        <Link href="/" className="flex items-center gap-2">
          {open ? (
            <Image
              src="/images/logo.png"
              alt="Gold Maq Controle Logo"
              width={120}
              height={30}
              priority
              className="transition-all duration-300 ease-in-out"
            />
          ) : (
            <Settings className="w-6 h-6 text-primary transition-all duration-300 ease-in-out" />
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="h-full">
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <SidebarMenuItem key={item.label}>
                  <Link href={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={{ children: item.label, side: "right" }}
                      className="justify-start"
                    >
                      <item.icon className={cn("w-5 h-5", isActive && "text-sidebar-primary")} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
          <div className="mt-auto p-4 text-center text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            Versão {appVersion}
          </div>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const currentPathname = usePathname();
  const currentNavItem = navItems.find(item => {
    if (item.href === "/") return currentPathname === "/";
    return currentPathname.startsWith(item.href);
  });
  const pageTitle = currentNavItem?.label || "Painel";

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen">
        <MainSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between h-16 px-6 bg-card border-b">
            <div className="flex items-center">
               <SidebarTrigger className="md:hidden"/>
            </div>
            <div className="font-heading text-lg font-semibold text-foreground">
              {currentPathname === "/" ? "Painel Principal" : pageTitle}
            </div>
            <div>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto bg-background">
            {children}
            
          </main>
          <footer className="p-4 text-right text-xs text-muted-foreground border-t">
            
          </footer>
          <BackToTopButton />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
