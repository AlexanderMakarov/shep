'use client';

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { SendHorizontal, CircleStop, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AttachmentChip } from '@/components/common/attachment-chip';
import type { FormAttachment } from '@/hooks/use-attachments';

export interface ChatComposerProps {
  attachments: FormAttachment[];
  isDragOver: boolean;
  uploadError: string | null;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onRemoveAttachment: (id: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  onPickFiles: () => void;
  /** Agent/model picker rendered in the controls row. */
  agentPicker?: React.ReactNode;
  /** Blocks message input and sending while keeping auxiliary controls readable. */
  disabled?: boolean;
  /**
   * Stops the running agent. Wired to the real stop endpoint by the host —
   * without it the stop button would only hide local streaming state while
   * the agent kept running.
   */
  onStop?: () => void;
  /** True while the stop request is in flight. */
  isStopping?: boolean;
}

export function ChatComposer({
  attachments,
  isDragOver,
  uploadError,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onPaste,
  onRemoveAttachment,
  onNotesChange,
  onPickFiles,
  agentPicker,
  disabled,
  onStop,
  isStopping,
}: ChatComposerProps) {
  const { t } = useTranslation('web');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <ComposerPrimitive.Root className="shrink-0 border-t p-3">
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'flex flex-col gap-1.5 rounded-md border-2 border-transparent p-1 transition-colors',
          isDragOver && 'border-primary/50 bg-primary/5'
        )}
      >
        <div
          ref={containerRef}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            'border-input flex flex-col overflow-hidden rounded-md border shadow-xs transition-[color,box-shadow]',
            isFocused && 'ring-ring/50 border-ring ring-[3px]'
          )}
        >
          {/* Textarea — 1 row default, expands to 3, then scrolls.
              `disabled` is REAL here: `pointer-events-none` on the Root
              blocked the mouse only, so Enter still sent a message while
              the composer looked (and read, to a screen reader) inert. */}
          <ComposerPrimitive.Input
            rows={1}
            autoFocus
            disabled={disabled}
            placeholder={t('chat.writeMessage')}
            onPaste={onPaste}
            className="max-h-[4.5rem] min-h-0 resize-none rounded-none border-0 px-3 py-2.5 text-sm shadow-none focus:outline-none focus-visible:ring-0 disabled:cursor-not-allowed"
          />

          {/* Attachment chips — between textarea and controls bar */}
          {attachments.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
              {attachments.map((file) => (
                <AttachmentChip
                  key={file.id}
                  name={file.name}
                  size={file.size}
                  mimeType={file.mimeType}
                  path={file.path}
                  onRemove={() => onRemoveAttachment(file.id)}
                  loading={file.loading}
                  notes={file.notes}
                  onNotesChange={(notes) => onNotesChange(file.id, notes)}
                />
              ))}
            </div>
          ) : null}

          {/* Upload error */}
          {uploadError ? <p className="text-destructive px-3 pb-2 text-xs">{uploadError}</p> : null}

          {/* Controls bar — agent picker + status left, actions right */}
          <div className="border-input flex items-center gap-3 border-t px-3 py-1.5">
            {/* Agent/model picker */}
            {agentPicker}
            <div className="flex-1" />

            {/* Attach files */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onPickFiles}
                  disabled={disabled}
                  aria-label={t('chat.attachFiles')}
                  className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('chat.attachFiles')}</TooltipContent>
            </Tooltip>

            {/* Send / Stop */}
            <ChatComposerAction disabled={disabled} onStop={onStop} isStopping={isStopping} />
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

function ChatComposerAction({
  disabled,
  onStop,
  isStopping,
}: {
  disabled?: boolean;
  onStop?: () => void;
  isStopping?: boolean;
}) {
  const { t } = useTranslation('web');
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send
          disabled={disabled}
          aria-label={t('accessibility.send')}
          className={cn(
            'bg-primary text-primary-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            'hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-30',
            'transition-colors'
          )}
        >
          <SendHorizontal className="size-3.5" />
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        {/* A real button wired to the host's stop handler. The assistant-ui
            Cancel primitive only unwinds local run state — on its own it
            leaves the agent process running. */}
        <button
          type="button"
          onClick={onStop}
          disabled={Boolean(isStopping) || !onStop}
          aria-label={t('chat.stop')}
          title={t('chat.forceStopAgent')}
          className={cn(
            'bg-destructive/10 text-destructive inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            'hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50',
            'transition-colors'
          )}
        >
          <CircleStop className={cn('size-3.5', isStopping && 'animate-pulse')} />
        </button>
      </ThreadPrimitive.If>
    </>
  );
}
