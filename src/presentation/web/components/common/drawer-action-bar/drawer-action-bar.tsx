'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PaperclipIcon, Send, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSoundAction } from '@/hooks/use-sound-action';
import { AttachmentChip } from '@/components/common/attachment-chip';
import { pickFiles } from '@/components/common/feature-create-drawer/pick-files';
import type { DrawerActionBarProps, RejectAttachment } from './drawer-action-bar-config';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Fallback shown when a reject fails without a reason. The `web` i18n namespace has
 * no key for it and `translations/` is outside this change, so it matches the other
 * hardcoded copy already in this file (e.g. 'Ask AI to revise...').
 */
const REJECT_FAILED_MESSAGE = 'Failed to send feedback — your draft was kept';

/** Explains why Reject is disabled; same hardcoded-copy reason as above. */
const REJECT_NEEDS_TEXT_MESSAGE = 'Type feedback above to enable Reject';

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.kt',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.zip',
  '.tar',
  '.gz',
  '.log',
]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

/**
 * Copy for the confirmation dialog placed in front of an irreversible approve.
 *
 * The description must NAME the thing being acted on (branch, PR, ...) so the
 * user confirms against the right target rather than a generic "are you sure".
 */
export interface ApproveConfirmation {
  /** Dialog heading, e.g. "Merge this branch?" */
  title: string;
  /** Names the target of the irreversible action. */
  description: ReactNode;
  /** Label of the confirming action. Defaults to `approveLabel`. */
  confirmLabel?: string;
}

/** Result shape a reject handler may return so the bar can tell success from failure. */
export interface RejectOutcome {
  ok: boolean;
  error?: string;
}

/**
 * Local widening of `DrawerActionBarProps`:
 *  - `onReject` may return an outcome (or a promise of one) so a FAILED reject
 *    can keep the user's draft instead of destroying it.
 *  - `approveConfirm` opts a caller into a confirmation dialog.
 *
 * The shared config interface stays untouched; `(f, a) => void` is still
 * assignable here, so every existing caller keeps type-checking.
 */
export interface DrawerActionBarComponentProps extends Omit<DrawerActionBarProps, 'onReject'> {
  onReject?: (
    feedback: string,
    attachments: RejectAttachment[]
  ) => void | RejectOutcome | Promise<void | RejectOutcome>;
  /** When provided, Approve opens this confirmation dialog instead of firing immediately. */
  approveConfirm?: ApproveConfirmation;
}

export function DrawerActionBar({
  onReject,
  onApprove,
  approveLabel,
  approveVariant = 'default',
  approveConfirm,
  revisionPlaceholder,
  isProcessing = false,
  isRejecting = false,
  children,
  chatInput: controlledChatInput,
  onChatInputChange,
}: DrawerActionBarComponentProps) {
  const { t } = useTranslation('web');
  const isWarning = approveVariant === 'warning';
  const ApproveIcon = isWarning ? AlertTriangle : Check;
  const accentBg = isWarning ? 'bg-orange-500/85' : 'bg-blue-500/85';
  const accentBorder = isWarning ? 'border-orange-400/60' : 'border-blue-400/60';
  const [internalChatInput, setInternalChatInput] = useState('');
  const chatInput = controlledChatInput ?? internalChatInput;
  const setChatInput = onChatInputChange ?? setInternalChatInput;
  const approveSound = useSoundAction('approve');
  const disabled = isProcessing || isRejecting;

  const [attachments, setAttachments] = useState<RejectAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectInFlight, setRejectInFlight] = useState(false);
  const hasText = chatInput.trim().length > 0;
  const dragCounterRef = useRef(0);
  const sessionIdRef = useRef(crypto.randomUUID());
  const rejectInFlightRef = useRef(false);

  const handleFiles = useCallback(async (fileList: File[]) => {
    setUploadError(null);

    for (const file of fileList) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`"${file.name}" exceeds 10 MB limit`);
        return;
      }
      const ext = getExtension(file.name);
      if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        setUploadError(`File type "${ext}" is not allowed`);
        return;
      }
    }

    for (const file of fileList) {
      const tempId = crypto.randomUUID();

      setAttachments((prev) => [
        ...prev,
        {
          id: tempId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          path: '',
          loading: true,
        },
      ]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionIdRef.current);

        const res = await fetch('/api/attachments/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Upload failed' }));
          setAttachments((prev) => prev.filter((a) => a.id !== tempId));
          setUploadError(body.error ?? 'Upload failed');
          return;
        }

        const uploaded = await res.json();
        setAttachments((prev) => {
          const isDupe = prev.some((a) => a.id !== tempId && a.path === uploaded.path);
          if (isDupe) return prev.filter((a) => a.id !== tempId);
          return prev.map((a) =>
            a.id === tempId ? { ...uploaded, id: tempId, loading: false } : a
          );
        });
      } catch {
        setAttachments((prev) => prev.filter((a) => a.id !== tempId));
        setUploadError('Upload failed');
      }
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  const handleAddFiles = useCallback(async () => {
    try {
      const files = await pickFiles();
      if (files) {
        setAttachments((prev) => {
          const existingPaths = new Set(prev.map((f) => f.path));
          const unique = files
            .filter((f) => !existingPaths.has(f.path))
            .map(
              (f): RejectAttachment => ({
                id: crypto.randomUUID(),
                name: f.name,
                size: f.size,
                mimeType: 'application/octet-stream',
                path: f.path,
              })
            );
          return unique.length > 0 ? [...prev, ...unique] : prev;
        });
      }
    } catch {
      // Native dialog failed — silently ignore
    }
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleNotesChange = useCallback((id: string, notes: string) => {
    setAttachments((prev) => prev.map((f) => (f.id === id ? { ...f, notes } : f)));
  }, []);

  const clearForm = useCallback(() => {
    setChatInput('');
    setAttachments([]);
    setUploadError(null);
  }, [setChatInput]);

  /** Fire the approval for real. Only ever reached from an explicit Approve control. */
  const runApprove = useCallback(() => {
    approveSound.play();
    onApprove();
  }, [approveSound, onApprove]);

  /**
   * Request approval. With `approveConfirm` this opens the confirmation dialog —
   * the keyboard accelerator deliberately goes through the same gate as the button.
   */
  const requestApprove = useCallback(() => {
    if (disabled) return;
    if (approveConfirm) {
      setConfirmOpen(true);
      return;
    }
    runApprove();
  }, [approveConfirm, disabled, runApprove]);

  /**
   * Submit the revision feedback.
   *
   * The form is cleared ONLY on success: a failed reject used to wipe the typed
   * feedback and every uploaded attachment with no way to get them back.
   */
  const submitReject = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !onReject || disabled || rejectInFlightRef.current) return;

    rejectInFlightRef.current = true;
    setRejectInFlight(true);
    try {
      const outcome = await onReject(
        text,
        attachments.filter((a) => !a.loading)
      );
      if (outcome && outcome.ok === false) {
        toast.error(outcome.error ?? REJECT_FAILED_MESSAGE);
        return;
      }
      clearForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : REJECT_FAILED_MESSAGE);
    } finally {
      rejectInFlightRef.current = false;
      setRejectInFlight(false);
    }
  }, [attachments, chatInput, clearForm, disabled, onReject]);

  function handleFormSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    void submitReject();
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        // Accelerators are an ADDITIONAL path to the two explicit buttons,
        // never the only way to reach either action.
        if (e.shiftKey) {
          requestApprove();
        } else {
          void submitReject();
        }
      }
    },
    [requestApprove, submitReject]
  );

  const modKey =
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl';

  const rejectLabel = t('drawerActionBar.reject');
  const rejectDisabled = disabled || rejectInFlight || !hasText;

  /**
   * The approve control. Its label and accessible name are FIXED — they no longer
   * flip with hover position or held modifier keys, and the reject label is no
   * longer a sibling span inside the same button.
   */
  const approveButton = (
    <button
      type="button"
      disabled={disabled}
      aria-busy={isProcessing}
      onClick={approveConfirm ? undefined : requestApprove}
      data-testid="drawer-action-approve"
      className={cn(
        'flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium whitespace-nowrap text-white shadow-sm transition-colors',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        accentBorder,
        accentBg
      )}
    >
      <ApproveIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {approveLabel}
    </button>
  );

  const approveControl = approveConfirm ? (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogTrigger asChild>{approveButton}</AlertDialogTrigger>
      <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{approveConfirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{approveConfirm.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('deleteFeature.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant={isWarning ? 'destructive' : 'default'}
            onClick={runApprove}
            data-testid="drawer-action-approve-confirm"
          >
            {approveConfirm.confirmLabel ?? approveLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : (
    approveButton
  );

  return (
    <div className="border-border shrink-0 border-t">
      {children}
      {onReject ? (
        <TooltipProvider delayDuration={400}>
          <form onSubmit={handleFormSubmit} className="p-3">
            <div
              role="region"
              aria-label={t('createDrawer.fileDropZone')}
              data-drag-over={isDragOver ? 'true' : 'false'}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={cn(
                'rounded-md border-2 border-transparent transition-colors',
                isDragOver && 'border-primary/50 bg-primary/5'
              )}
            >
              <div className="border-input focus-within:ring-ring/50 focus-within:border-ring flex flex-col overflow-hidden rounded-md border shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]">
                <Textarea
                  placeholder={revisionPlaceholder ?? 'Ask AI to revise...'}
                  aria-label={revisionPlaceholder ?? 'Ask AI to revise...'}
                  disabled={disabled}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  rows={1}
                  className="max-h-[35dvh] min-h-9 flex-1 resize-none overflow-y-auto rounded-none border-0 py-2 shadow-none focus-visible:ring-0"
                  data-testid="drawer-chat-input"
                />
                {attachments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                    {attachments.map((file) => (
                      <AttachmentChip
                        key={file.id}
                        name={file.name}
                        size={file.size}
                        mimeType={file.mimeType}
                        path={file.path}
                        onRemove={() => handleRemoveFile(file.id)}
                        disabled={disabled}
                        loading={file.loading}
                        notes={file.notes}
                        onNotesChange={(notes) => handleNotesChange(file.id, notes)}
                      />
                    ))}
                  </div>
                )}
                {uploadError ? (
                  <p className="text-destructive px-3 pb-2 text-xs">{uploadError}</p>
                ) : null}
                <div className="border-input flex flex-wrap items-center gap-2 border-t px-3 py-1.5">
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
                    <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
                      {modKey}+Enter
                    </kbd>{' '}
                    {rejectLabel.toLowerCase()} ·{' '}
                    <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
                      {modKey}+Shift+Enter
                    </kbd>{' '}
                    {approveLabel.toLowerCase()}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleAddFiles}
                        disabled={disabled}
                        aria-label={t('chat.attachFiles')}
                        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors"
                      >
                        <PaperclipIcon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{t('chat.attachFiles')}</TooltipContent>
                  </Tooltip>

                  {/* Two distinct actions. Neither one's meaning depends on hover
                      position, held modifiers, or whether the textarea has text. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="submit"
                        disabled={rejectDisabled}
                        data-testid="drawer-action-reject"
                        title={hasText ? undefined : REJECT_NEEDS_TEXT_MESSAGE}
                        className={cn(
                          'border-border bg-muted/50 hover:bg-muted flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium whitespace-nowrap shadow-sm transition-colors',
                          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {rejectLabel}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t('drawerActionBar.sendRevisionFeedback')}
                    </TooltipContent>
                  </Tooltip>

                  {approveControl}
                </div>
              </div>
            </div>
          </form>
        </TooltipProvider>
      ) : (
        <div className="flex items-center gap-2 px-4 pb-4">
          {approveConfirm ? (
            approveControl
          ) : (
            <Button
              type="button"
              className="flex-1"
              disabled={disabled}
              aria-busy={isProcessing}
              onClick={requestApprove}
            >
              {approveLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
