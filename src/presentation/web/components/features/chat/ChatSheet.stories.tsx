import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from '@storybook/test';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarFeaturesProvider } from '@/hooks/sidebar-features-context';
import { GlobalSearchDialog } from '@/components/features/search/global-search-dialog';
import { GlobalChatPopup } from './ChatSheet';

const meta = {
  title: 'Features/GlobalChatPopup',
  component: GlobalChatPopup,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <SidebarProvider>
        <SidebarFeaturesProvider initialHasRepositories>
          <GlobalSearchDialog />
          <Story />
        </SidebarFeaturesProvider>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof GlobalChatPopup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Floating: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Shep Chat' }));
    await expect(canvas.getByRole('dialog', { name: 'Shep Chat' })).toHaveAttribute(
      'aria-modal',
      'false'
    );
  },
};

export const Maximized: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Shep Chat' }));
    await userEvent.click(canvas.getByRole('button', { name: /Maximize/ }));
    await expect(canvas.getByRole('dialog', { name: 'Shep Chat' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
  },
};

export const KeyboardShortcut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvasElement);
    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}');
    await expect(canvas.getByRole('dialog', { name: 'Shep Chat' })).toBeVisible();
    await expect(
      within(canvasElement.ownerDocument.body).queryByTestId('global-search-dialog')
    ).not.toBeInTheDocument();
  },
};
