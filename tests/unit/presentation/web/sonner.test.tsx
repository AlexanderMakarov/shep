/**
 * The Toaster overrode `classNames.toast` for EVERY toast type and never
 * differentiated them, so an error toast was visually identical to a success
 * toast. Call sites are already disciplined (`toast.error` everywhere); the
 * styling was the only gap.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

afterEach(() => {
  toast.dismiss();
  cleanup();
});

async function showAndRead(fire: () => void, text: string): Promise<string> {
  render(<Toaster />);
  fire();
  const title = await screen.findByText(text);
  const el = title.closest('[data-sonner-toast]');
  if (!el) throw new Error('toast element not found');
  return el.className;
}

describe('Toaster — type differentiation (P2)', () => {
  it('gives an error toast a destructive accent', async () => {
    const cls = await showAndRead(() => toast.error('Boom'), 'Boom');
    expect(cls).toMatch(/border-destructive/);
  });

  it('gives a success toast its own accent', async () => {
    const cls = await showAndRead(() => toast.success('Saved'), 'Saved');
    expect(cls).toMatch(/border-green-600/);
  });

  it('gives a warning toast its own accent', async () => {
    const cls = await showAndRead(() => toast.warning('Careful'), 'Careful');
    expect(cls).toMatch(/border-amber-600/);
  });

  it('renders error and success with different classes', async () => {
    const errorCls = await showAndRead(() => toast.error('E1'), 'E1');
    toast.dismiss();
    cleanup();
    const successCls = await showAndRead(() => toast.success('S1'), 'S1');

    expect(errorCls).not.toEqual(successCls);
  });

  it('keeps the neutral surface of the existing design language', async () => {
    const cls = await showAndRead(() => toast.error('Boom'), 'Boom');
    expect(cls).toMatch(/group-\[\.toaster\]:bg-background/);
    expect(cls).toMatch(/group-\[\.toaster\]:text-foreground/);
  });

  it('gives the type accent enough selector weight to beat the base border', async () => {
    // sonner joins base + per-type class names on ONE element, so the accent
    // only wins if its selector is more specific than `group-[.toaster]:border-border`.
    const cls = await showAndRead(() => toast.error('Boom'), 'Boom');
    expect(cls).toMatch(/data-\[type=error\]/);
  });
});

describe('Toaster — bulk-action toolbar collision (P2)', () => {
  it('anchors its bottom offset to an overridable custom property', async () => {
    render(<Toaster position="bottom-center" />);
    toast('hello');
    await screen.findByText('hello');

    const toaster = document.querySelector('[data-sonner-toaster]') as HTMLElement | null;
    expect(toaster).not.toBeNull();
    // globals.css raises --shep-toast-offset-bottom while the bulk-action
    // toolbar is mounted, which lifts the stack clear of it.
    expect(toaster?.style.getPropertyValue('--offset-bottom')).toContain(
      'var(--shep-toast-offset-bottom'
    );
  });
});
