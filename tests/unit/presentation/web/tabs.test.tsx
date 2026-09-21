import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

describe('Tabs', () => {
  describe('TabsList', () => {
    it('renders with default classes', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      const tabsList = screen.getByTestId('tabs-list');
      expect(tabsList).toBeInTheDocument();
      expect(tabsList).toHaveClass('inline-flex', 'h-9', 'items-center', 'justify-center');
    });

    it('applies scroll classes when scrollable={true}', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList scrollable data-testid="tabs-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      const tabsList = screen.getByTestId('tabs-list');
      expect(tabsList).toHaveClass('overflow-x-auto', 'overflow-y-hidden', 'flex', 'w-full');
    });

    it('does not apply scroll classes when scrollable={false}', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList scrollable={false} data-testid="tabs-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      const tabsList = screen.getByTestId('tabs-list');
      expect(tabsList).not.toHaveClass('overflow-x-auto', 'overflow-y-hidden');
    });

    it('merges custom className with scroll classes', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList scrollable className="custom-class" data-testid="tabs-list">
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      const tabsList = screen.getByTestId('tabs-list');
      expect(tabsList).toHaveClass(
        'custom-class',
        'overflow-x-auto',
        'overflow-y-hidden',
        'flex',
        'w-full'
      );
    });

    it('renders tabs with triggers', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      expect(screen.getByRole('tab', { name: /tab 1/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /tab 2/i })).toBeInTheDocument();
    });

    it('renders content for active tab', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      expect(screen.getByText('Content 1')).toBeInTheDocument();
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
    });
  });

  describe('accessibility (WCAG 2.1 Level AA)', () => {
    it('standard TabsList has no WCAG violations', async () => {
      const { container } = render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
            <TabsTrigger value="tab3">Tab 3</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
          <TabsContent value="tab3">Content 3</TabsContent>
        </Tabs>
      );

      const results = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      expect(results.violations).toHaveLength(0);
    });

    it('scrollable TabsList has no WCAG violations', async () => {
      const { container } = render(
        <Tabs defaultValue="tab1">
          <TabsList scrollable data-testid="tabs-list">
            {['Tab 1', 'Tab 2', 'Tab 3', 'Tab 4', 'Tab 5', 'Tab 6', 'Tab 7', 'Tab 8'].map(
              (label, i) => (
                <TabsTrigger key={i} value={`tab${i + 1}`}>
                  {label}
                </TabsTrigger>
              )
            )}
          </TabsList>
          {['Tab 1', 'Tab 2', 'Tab 3', 'Tab 4', 'Tab 5', 'Tab 6', 'Tab 7', 'Tab 8'].map(
            (label, i) => (
              <TabsContent key={i} value={`tab${i + 1}`}>
                Content {i + 1}
              </TabsContent>
            )
          )}
        </Tabs>
      );

      const results = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      expect(results.violations).toHaveLength(0);
    });

    it('all tab triggers remain accessible in scrollable container', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList scrollable>
            {[
              'Overview',
              'Activity',
              'Log',
              'Plan',
              'Tech Decisions',
              'Product',
              'Chat',
              'Bedrock',
            ].map((label, i) => (
              <TabsTrigger key={i} value={`tab${i + 1}`}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {[
            'Overview',
            'Activity',
            'Log',
            'Plan',
            'Tech Decisions',
            'Product',
            'Chat',
            'Bedrock',
          ].map((_, i) => (
            <TabsContent key={i} value={`tab${i + 1}`}>
              Content {i + 1}
            </TabsContent>
          ))}
        </Tabs>
      );

      // All 8 tab triggers must be in the DOM with proper role and be keyboard accessible
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(8);
      tabs.forEach((tab) => {
        expect(tab).toBeInTheDocument();
        // Each tab must have a tabindex making it part of the roving focus group
        const tabindex = tab.getAttribute('tabindex');
        expect(tabindex).not.toBeNull();
      });
    });
  });

  describe('forceMount (draft preservation)', () => {
    // Radix keeps the panel <div> in the DOM but drops its CHILDREN when the
    // tab is inactive — that is what destroys the chat draft, attachments and
    // model override. `forceMount` is the opt-in that keeps children alive.
    function Harness() {
      return (
        <Tabs defaultValue="chat">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" forceMount data-testid="chat-panel">
            <input aria-label="draft" defaultValue="" />
          </TabsContent>
          <TabsContent value="plan" data-testid="plan-panel">
            Plan content
          </TabsContent>
        </Tabs>
      );
    }

    it("keeps a force-mounted panel's children alive while another tab is active", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByRole('tab', { name: 'Plan' }));

      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
      // The children are the part Radix drops without forceMount.
      expect(screen.getByLabelText('draft')).toBeInTheDocument();
    });

    it('preserves the draft typed into a force-mounted panel across tab switches', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.type(screen.getByLabelText('draft'), 'half-written message');
      await user.click(screen.getByRole('tab', { name: 'Plan' }));
      await user.click(screen.getByRole('tab', { name: 'Chat' }));

      expect(screen.getByLabelText('draft')).toHaveValue('half-written message');
    });

    it('hides an inactive force-mounted panel from sight and from assistive tech', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByRole('tab', { name: 'Plan' }));
      const panel = screen.getByTestId('chat-panel');

      expect(panel).toHaveAttribute('data-state', 'inactive');
      // Radix stops setting the `hidden` attribute once a panel is
      // force-mounted, so the primitive must supply `display: none` itself —
      // that removes the node from the a11y tree AND the tab order.
      expect(panel.className.split(/\s+/)).toContain('data-[state=inactive]:hidden');
    });

    it('leaves the default (non-opted-in) behaviour untouched', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      // Without forceMount the panel's children stay unmounted.
      expect(screen.queryByText('Plan content')).not.toBeInTheDocument();
      expect(screen.getByTestId('plan-panel').className).not.toMatch(
        /data-\[state=inactive\]:hidden/
      );

      await user.click(screen.getByRole('tab', { name: 'Plan' }));
      expect(screen.getByText('Plan content')).toBeInTheDocument();
    });
  });
});
