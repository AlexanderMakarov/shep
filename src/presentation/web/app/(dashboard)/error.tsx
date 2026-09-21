'use client';

/**
 * Error boundary for the dashboard route segment.
 *
 * Next's App Router only renders an error UI if the segment provides one.
 * Without this file a throw anywhere in the segment (its layout's
 * `getGraphData()`, a page's DI resolve, a client render error) produced a
 * blank screen in production — no message, no digest, no way back except a
 * manual reload.
 *
 * `reset()` re-renders the segment, which is the cheap recovery when the
 * failure was transient (daemon restarting, a locked SQLite file).
 */

import { useEffect } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/empty-state';
import { createLogger } from '@/lib/logger';

const log = createLogger('[dashboard/error]');

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error(error);
  }, [error]);

  return (
    <div
      data-testid="dashboard-error"
      role="alert"
      className="bg-background absolute inset-0 z-30 flex items-center justify-center"
    >
      <EmptyState
        icon={<TriangleAlert className="h-8 w-8 text-red-500" />}
        title="Something went wrong in the Control Center"
        description={error.message || 'An unexpected error occurred.'}
        action={
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => reset()}
              data-testid="dashboard-error-retry"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Try again
            </Button>
            {error.digest ? (
              <span className="text-muted-foreground text-[10px]">Error ID: {error.digest}</span>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
