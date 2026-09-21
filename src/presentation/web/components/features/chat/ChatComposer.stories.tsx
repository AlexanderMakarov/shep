import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react';
import type { ThreadMessageLike } from '@assistant-ui/react';
import { fn } from '@storybook/test';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatComposer } from './ChatComposer';

function ComposerRuntime({ children }: { children: ReactNode }) {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async () => undefined,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TooltipProvider>{children}</TooltipProvider>
    </AssistantRuntimeProvider>
  );
}

const meta: Meta<typeof ChatComposer> = {
  title: 'Features/Chat/ChatComposer',
  component: ChatComposer,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ComposerRuntime>
        <div className="max-w-lg rounded-md border">
          <Story />
        </div>
      </ComposerRuntime>
    ),
  ],
  args: {
    attachments: [],
    isDragOver: false,
    uploadError: null,
    onDragEnter: fn(),
    onDragLeave: fn(),
    onDragOver: fn(),
    onDrop: fn(),
    onPaste: fn(),
    onRemoveAttachment: fn(),
    onNotesChange: fn(),
    onPickFiles: fn(),
    agentPicker: (
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-label="Agent and model"
        aria-expanded={false}
      >
        <span className="text-muted-foreground text-xs">Choose agent</span>
      </Button>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof ChatComposer>;

export const Default: Story = {};

/** The picker remains readable while workflow execution blocks new messages. */
export const WorkflowInProgress: Story = {
  args: { disabled: true },
};

export const UploadError: Story = {
  args: { uploadError: 'The attachment could not be uploaded. Please try again.' },
};
