import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with default variant', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it('renders all variants', () => {
    const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const;

    variants.forEach((variant) => {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      const button = screen.getByRole('button', { name: variant });
      expect(button).toBeInTheDocument();
      unmount();
    });
  });

  it('renders all sizes', () => {
    const sizes = ['default', 'sm', 'lg', 'icon'] as const;

    sizes.forEach((size) => {
      const { unmount } = render(<Button size={size}>{size}</Button>);
      const button = screen.getByRole('button', { name: size });
      expect(button).toBeInTheDocument();
      unmount();
    });
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    const button = screen.getByRole('button', { name: /click me/i });
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders in disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button', { name: /disabled/i });
    expect(button).toBeDisabled();
  });

  it('does not fire click when disabled', () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>
    );

    const button = screen.getByRole('button', { name: /disabled/i });
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('supports custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole('button', { name: /custom/i });
    expect(button).toHaveClass('custom-class');
  });

  it('renders as child component when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test');
  });
});

describe('Button focus indicator (WCAG 2.4.11 non-text contrast)', () => {
  // The old indicator was `focus-visible:border-ring` + `ring-ring/50`. The
  // border utility is a no-op on every variant that carries no `border` at
  // all (default / secondary / ghost / link), which left a 1.83:1 ring as the
  // only focus affordance. WCAG 2.4.11 requires 3:1, so the ring must be
  // full-opacity and separated from the control by an offset.
  const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const;

  it.each(variants)('variant "%s" renders a 2px offset focus ring', (variant) => {
    render(<Button variant={variant}>{variant}</Button>);
    const button = screen.getByRole('button', { name: variant });

    expect(button).toHaveClass('focus-visible:ring-2');
    expect(button).toHaveClass('focus-visible:ring-offset-2');
    expect(button).toHaveClass('focus-visible:ring-offset-background');
  });

  it.each(variants)('variant "%s" keeps a full-opacity ring colour', (variant) => {
    render(<Button variant={variant}>{variant}</Button>);
    const cls = screen.getByRole('button', { name: variant }).className;

    // destructive re-colours its ring; every other variant uses --color-ring.
    const expected =
      variant === 'destructive' ? 'focus-visible:ring-destructive' : 'focus-visible:ring-ring';
    expect(cls.split(/\s+/)).toContain(expected);
  });

  it.each(variants)('variant "%s" drops the sub-3:1 translucent ring', (variant) => {
    render(<Button variant={variant}>{variant}</Button>);
    const cls = screen.getByRole('button', { name: variant }).className;

    expect(cls).not.toMatch(/focus-visible:ring-ring\/50/);
    expect(cls).not.toMatch(/focus-visible:ring-\[3px\]/);
    // A translucent destructive ring is equally invisible.
    expect(cls).not.toMatch(/focus-visible:ring-destructive\/\d/);
  });

  const iconSizes = ['icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const;

  it.each(iconSizes)('icon-only size "%s" still renders the offset ring', (size) => {
    render(
      <Button size={size} aria-label={`icon ${size}`}>
        <svg />
      </Button>
    );
    const button = screen.getByRole('button', { name: `icon ${size}` });

    expect(button).toHaveClass('focus-visible:ring-2');
    expect(button).toHaveClass('focus-visible:ring-offset-2');
    expect(button.className.split(/\s+/)).toContain('focus-visible:ring-ring');
  });
});
