
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconColor?: string;
  href?: string;
  valueColor?: string;
  additionalInfo?: React.ReactNode;
}

export function KPICard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = 'text-primary',
  href,
  valueColor,
  additionalInfo,
}: KPICardProps) {
  const cardContent = (
    <Card
      className={cn(
        'shadow-lg hover:shadow-xl transition-shadow duration-300 h-full flex flex-col',
        href && 'cursor-pointer'
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium font-headline">{title}</CardTitle>
        <Icon className={cn('h-5 w-5', iconColor)} />
      </CardHeader>
      <CardContent className="flex-grow">
        <div className={cn('text-2xl font-bold', valueColor)}>{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground pt-1">{description}</p>
        )}
        {additionalInfo && (
            <div className="text-xs text-muted-foreground pt-1">{additionalInfo}</div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
