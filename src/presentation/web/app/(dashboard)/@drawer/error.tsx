'use client';

/**
 * Error boundary for the @drawer parallel-route slot.
 *
 * The slot needs its own boundary: without one, a failure while building a
 * drawer bubbles to the segment boundary and takes the whole Control
 * Center down with it, even though the canvas behind the drawer is fine.
 * With it, the canvas keeps working and the failure is reported where the
 * drawer would have opened — which is where the user clicked.
 *
 * The slot renders inside the canvas container, so this panel positions
 * itself like a drawer instead of flowing into the canvas.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/logger';

const log = createLogger('[dashboard/@drawer/error]');

export default function DrawerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    log.error(error);
  }, [error]);

  return (
    <div
      data-testid="drawer-error"
      role="alert"
      className="bg-background fixed inset-y-0 right-0 z-40 flex w-[420px] max-w-[92vw] flex-col gap-3 border-s p-4 shadow-lg"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold">This panel couldn&apos;t be opened</h2>
          <p className="text-muted-foreground mt-1 text-[11px] break-words">
            {error.message || 'An unexpected error occurred.'}
          </p>
          {error.digest ? (
            <p className="text-muted-foreground mt-1 text-[10px]">Error ID: {error.digest}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => reset()}
          data-testid="drawer-error-retry"
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Try again
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => router.push('/control-center')}
          data-testid="drawer-error-close"
        >
          <X className="mr-2 h-3.5 w-3.5" />
          Close
        </Button>
      </div>
    </div>
  );
}
