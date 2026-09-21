import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 3,
  className,
  ...props
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className={cn('flex flex-col items-center gap-4 px-4 py-12 text-center', className)}
      {...props}
    >
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description ? <p className="text-muted-foreground max-w-md text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
