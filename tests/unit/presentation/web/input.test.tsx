import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toBeInTheDocument();
  });

  it('renders with default value', () => {
    render(<Input defaultValue="Hello" />);
    const input = screen.getByDisplayValue('Hello');
    expect(input).toBeInTheDocument();
  });

  it('handles value change', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'test');

    expect(handleChange).toHaveBeenCalled();
  });

  it('renders in disabled state', () => {
    render(<Input disabled placeholder="Disabled" />);
    const input = screen.getByPlaceholderText('Disabled');
    expect(input).toBeDisabled();
  });

  it('renders different input types', () => {
    const { rerender } = render(<Input type="email" placeholder="Email" />);
    let input = screen.getByPlaceholderText('Email');
    expect(input).toHaveAttribute('type', 'email');

    rerender(<Input type="password" placeholder="Password" />);
    input = screen.getByPlaceholderText('Password');
    expect(input).toHaveAttribute('type', 'password');

    rerender(<Input type="number" placeholder="Number" />);
    input = screen.getByPlaceholderText('Number');
    expect(input).toHaveAttribute('type', 'number');
  });

  it('supports custom className', () => {
    render(<Input className="custom-input" placeholder="Custom" />);
    const input = screen.getByPlaceholderText('Custom');
    expect(input).toHaveClass('custom-input');
  });

  it('supports controlled input', () => {
    const handleChange = vi.fn();
    render(<Input value="controlled" onChange={handleChange} />);
    const input = screen.getByDisplayValue('controlled');
    expect(input).toBeInTheDocument();
  });
});

describe('Input boundary contrast (WCAG 1.4.11 non-text contrast)', () => {
  // `border-input` resolves to --color-input (#e2e8f0), which is 1.23:1 on
  // white — far below the 3:1 a control boundary needs. --color-input is also
  // reused as a SURFACE (the Switch track, `dark:bg-input/30` fills), so the
  // fix is applied at this call site via a dedicated boundary token rather
  // than by repainting --color-input itself.
  it('uses the dedicated control-boundary token, not the surface token', () => {
    render(<Input placeholder="Bordered" />);
    const classes = screen.getByPlaceholderText('Bordered').className.split(/\s+/);

    expect(classes).toContain('border-input-border');
    expect(classes).not.toContain('border-input');
  });

  it('still renders a 1px border box', () => {
    render(<Input placeholder="Bordered" />);
    expect(screen.getByPlaceholderText('Bordered').className.split(/\s+/)).toContain('border');
  });
});
