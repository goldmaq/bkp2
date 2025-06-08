
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AppQueryProvider } from '@/components/shared/QueryProvider'; 

export const metadata: Metadata = {
  title: 'Gold Maq',
  description: 'Sistema de gerenciamento para as operações da Gold Maq.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <AppQueryProvider> 
          {children}
          <Toaster />
        </AppQueryProvider>
      </body>
    </html>
  );
}
