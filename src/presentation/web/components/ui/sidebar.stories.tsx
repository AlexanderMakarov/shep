import type { Meta, StoryObj } from '@storybook/react';
import { Home, Settings } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from './sidebar';

function SidebarPreview({ defaultOpen = true }: { defaultOpen?: boolean }) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="overflow-hidden p-4 font-semibold">Shep</SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive tooltip="Applications">
                <Home />
                <span>Applications</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Settings">
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <span>Applications</span>
        </header>
        <p className="text-muted-foreground p-4 text-sm">
          Toggle the sidebar with the button or Command/Control+B.
        </p>
      </SidebarInset>
    </SidebarProvider>
  );
}

const meta = {
  title: 'Primitives/Sidebar',
  component: SidebarPreview,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof SidebarPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};
export const Collapsed: Story = { args: { defaultOpen: false } };
