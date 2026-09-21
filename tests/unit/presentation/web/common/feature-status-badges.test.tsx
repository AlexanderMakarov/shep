import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { FeatureStatusBadges } from '@/components/common/feature-status-badges';

function renderWithSidebar(ui: React.ReactElement) {
  return render(<SidebarProvider>{ui}</SidebarProvider>);
}

describe('FeatureStatusBadges', () => {
  it('renders badges for statuses with counts > 0', () => {
    renderWithSidebar(
      <FeatureStatusBadges
        counts={{ 'action-needed': 2, 'in-progress': 3, pending: 0, blocked: 0, error: 0, done: 5 }}
      />
    );

    expect(screen.getByTestId('feature-status-badges')).toBeInTheDocument();
    expect(screen.getByTestId('feature-status-badge-action-needed')).toBeInTheDocument();
    expect(screen.getByTestId('feature-status-badge-in-progress')).toBeInTheDocument();
    expect(screen.getByTestId('feature-status-badge-done')).toBeInTheDocument();
  });

  it('displays correct count numbers', () => {
    renderWithSidebar(
      <FeatureStatusBadges
        counts={{ 'action-needed': 2, 'in-progress': 3, pending: 0, blocked: 0, error: 0, done: 5 }}
      />
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('hides statuses with zero count', () => {
    renderWithSidebar(
      <FeatureStatusBadges
        counts={{ 'action-needed': 0, 'in-progress': 2, pending: 0, blocked: 0, error: 0, done: 0 }}
      />
    );

    expect(screen.queryByTestId('feature-status-badge-action-needed')).not.toBeInTheDocument();
    expect(screen.getByTestId('feature-status-badge-in-progress')).toBeInTheDocument();
    expect(screen.queryByTestId('feature-status-badge-done')).not.toBeInTheDocument();
  });

  it('renders nothing when all counts are zero', () => {
    const { container } = renderWithSidebar(
      <FeatureStatusBadges
        counts={{ 'action-needed': 0, 'in-progress': 0, pending: 0, blocked: 0, error: 0, done: 0 }}
      />
    );

    expect(screen.queryByTestId('feature-status-badges')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid^="feature-status-badge-"]')).toBeNull();
  });

  describe('status announcements (A8)', () => {
    it('makes each badge a polite live region', () => {
      renderWithSidebar(
        <FeatureStatusBadges
          counts={{
            'action-needed': 0,
            'in-progress': 3,
            pending: 0,
            blocked: 0,
            error: 0,
            done: 0,
          }}
        />
      );

      const badge = screen.getByTestId('feature-status-badge-in-progress');
      expect(badge).toHaveAttribute('role', 'status');
      expect(badge).toHaveAttribute('aria-live', 'polite');
    });

    it('labels the badge with the status in words, not just a colour and a glyph', () => {
      renderWithSidebar(
        <FeatureStatusBadges
          counts={{
            'action-needed': 0,
            'in-progress': 0,
            pending: 0,
            blocked: 0,
            error: 2,
            done: 0,
          }}
        />
      );

      expect(screen.getByRole('status', { name: 'Error: 2' })).toBe(
        screen.getByTestId('feature-status-badge-error')
      );
    });

    it('announces the changing count, and only the badges that are shown', () => {
      const { rerender } = renderWithSidebar(
        <FeatureStatusBadges
          counts={{
            'action-needed': 0,
            'in-progress': 1,
            pending: 0,
            blocked: 0,
            error: 0,
            done: 0,
          }}
        />
      );

      expect(screen.getAllByRole('status')).toHaveLength(1);

      rerender(
        <SidebarProvider>
          <FeatureStatusBadges
            counts={{
              'action-needed': 0,
              'in-progress': 4,
              pending: 0,
              blocked: 0,
              error: 0,
              done: 0,
            }}
          />
        </SidebarProvider>
      );

      const badge = screen.getByTestId('feature-status-badge-in-progress');
      expect(badge).toHaveTextContent('4');
      expect(badge).toHaveAttribute('aria-label', 'In Progress: 4');
    });
  });

  it('applies custom className', () => {
    renderWithSidebar(
      <FeatureStatusBadges
        counts={{ 'action-needed': 1, 'in-progress': 0, pending: 0, blocked: 0, error: 0, done: 0 }}
        className="custom-class"
      />
    );

    expect(screen.getByTestId('feature-status-badges')).toHaveClass('custom-class');
  });
});
