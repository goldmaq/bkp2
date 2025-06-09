"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const [theme, toggleTheme, isMounted] = useTheme();

  if (!isMounted) {
    // Retorna um placeholder ou null para evitar hydration mismatch
    // e garantir que o botão só seja renderizado no cliente.
    // Um div com as dimensões do botão pode ser um bom placeholder.
    return <div style={{ width: '40px', height: '40px' }} />; 
  }

  return (
    <Button 
      variant="outline" 
      size="icon" 
      onClick={toggleTheme} 
      aria-label={`Mudar para tema ${theme === 'light' ? 'escuro' : 'claro'}`}
    >
      {theme === 'light' ? (
        <Moon className="h-[1.2rem] w-[1.2rem]" />
      ) : (
        <Sun className="h-[1.2rem] w-[1.2rem]" />
      )}
    </Button>
  );
}
