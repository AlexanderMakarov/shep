'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/*
 * Per-type accent.
 *
 * `classNames.toast` used to be the only override, so an error toast was
 * pixel-identical to a success toast. sonner joins the base class names and
 * the per-type ones onto the SAME element, so a bare `border-destructive`
 * would tie on specificity with the base `group-[.toaster]:border-border` and
 * the winner would depend on Tailwind's emission order. Chaining the
 * `data-[type=…]` attribute the toast already carries adds one selector and
 * settles it deterministically.
 *
 * Only the accent changes — the neutral `bg-background` surface stays, so the
 * toasts keep the existing design language instead of switching to sonner's
 * own pastel `richColors` palette.
 *
 * Every accent clears the 3:1 non-text contrast bar in both themes:
 *   destructive  #e7000b 4.77:1 light / #dc2626 4.10:1 dark
 *   green-600    #16a34a 3.30:1 light / 6.01:1 dark
 *   amber-600    #d97706 3.19:1 light / 6.21:1 dark
 *   primary      #155dfc 5.25:1 light / #3b82f6 5.38:1 dark
 *
 * These strings are spelled out in full because Tailwind scans source text
 * for literal class names — building them from parts silently emits nothing.
 */
const ERROR_ACCENT =
  'group-[.toaster]:data-[type=error]:border-destructive group-[.toaster]:data-[type=error]:border-s-4 data-[type=error]:[&_[data-icon]]:text-destructive';
const SUCCESS_ACCENT =
  'group-[.toaster]:data-[type=success]:border-green-600 group-[.toaster]:data-[type=success]:border-s-4 data-[type=success]:[&_[data-icon]]:text-green-600';
const WARNING_ACCENT =
  'group-[.toaster]:data-[type=warning]:border-amber-600 group-[.toaster]:data-[type=warning]:border-s-4 data-[type=warning]:[&_[data-icon]]:text-amber-600';
const INFO_ACCENT =
  'group-[.toaster]:data-[type=info]:border-primary group-[.toaster]:data-[type=info]:border-s-4 data-[type=info]:[&_[data-icon]]:text-primary';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // Resolved through a custom property so globals.css can lift the stack
      // clear of the bulk-action toolbar, which is pinned to the same corner.
      offset={{ bottom: 'var(--shep-toast-offset-bottom, 24px)' }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error: ERROR_ACCENT,
          success: SUCCESS_ACCENT,
          warning: WARNING_ACCENT,
          info: INFO_ACCENT,
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
