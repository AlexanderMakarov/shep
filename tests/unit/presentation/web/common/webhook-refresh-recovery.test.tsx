import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebhooksPageClient } from '@/components/features/webhooks/webhooks-page-client';

const status = {
  running: true,
  tunnel: { connected: false, publicUrl: null },
  webhooks: { registered: [], totalDeliveries: 7, successCount: 7, errorCount: 0, ignoredCount: 0 },
  startedAt: null,
};

describe('webhook refresh recovery', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(['transport', 'http'])(
    'preserves data and offers refresh after a %s failure',
    async (failure) => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        json: async () => (url.includes('/status') ? status : { deliveries: [] }),
      }));
      if (failure === 'transport') fetchMock.mockRejectedValueOnce(new Error('Connection lost'));
      else fetchMock.mockResolvedValueOnce({ ok: false });
      vi.stubGlobal('fetch', fetchMock);
      render(<WebhooksPageClient initialStatus={status} />);
      expect(await screen.findByRole('alert')).toHaveTextContent(/refresh|connection lost/i);
      expect(screen.getByText('Active')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(fetchMock).toHaveBeenCalledTimes(4);
    }
  );
});
