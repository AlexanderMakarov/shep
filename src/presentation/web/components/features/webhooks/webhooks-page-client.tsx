'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/page-header';
import { WebhookStatusCards } from './webhook-status-cards';
import { WebhookRepoList } from './webhook-repo-list';
import { WebhookDeliveryTable } from './webhook-delivery-table';
import type { WebhookSystemStatus, WebhookDeliveryRecord } from './types';

export interface WebhooksPageClientProps {
  initialStatus: WebhookSystemStatus;
}

export function WebhooksPageClient({ initialStatus }: WebhooksPageClientProps) {
  const [status, setStatus] = useState<WebhookSystemStatus>(initialStatus);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [statusRes, deliveriesRes] = await Promise.all([
        fetch('/api/webhooks/status'),
        fetch('/api/webhooks/deliveries?limit=100'),
      ]);
      if (!statusRes.ok || !deliveriesRes.ok)
        throw new Error('Unable to refresh webhooks. Try again.');
      const [nextStatus, data] = await Promise.all([statusRes.json(), deliveriesRes.json()]);
      setStatus(nextStatus);
      setDeliveries(data.deliveries);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to refresh webhooks. Try again.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Monitor GitHub webhook deliveries and tunnel status"
      >
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
          Refresh
        </Button>
      </PageHeader>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <WebhookStatusCards status={status} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <WebhookRepoList
            webhooks={status.webhooks.registered}
            tunnelUrl={status.tunnel.publicUrl}
          />
        </div>
        <div className="lg:col-span-2">
          <WebhookDeliveryTable deliveries={deliveries} />
        </div>
      </div>
    </div>
  );
}
