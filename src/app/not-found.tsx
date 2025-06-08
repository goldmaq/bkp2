
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-theme(spacing.16))] text-center p-6 bg-background">
      <AlertTriangle className="w-16 h-16 text-primary mb-6" />
      <h1 className="text-4xl font-bold font-headline text-foreground mb-4">404 - Página Não Encontrada</h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-md">
        Oops! Parece que a página que você está procurando não existe ou foi movida.
      </p>
      <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
        <Link href="/">Voltar para o Painel</Link>
      </Button>
    </div>
  );
}
