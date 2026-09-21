'use client';

import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const MIN_LEFT_PX = 400;
const MIN_RIGHT_PX = 400;
const INITIAL_LEFT_FRACTION = 0.4;

export interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  compactPane?: 'left' | 'right';
  onCompactPaneChange?: (pane: 'left' | 'right') => void;
}

export function ResizableSplit({
  left,
  right,
  compactPane,
  onCompactPaneChange,
}: ResizableSplitProps) {
  const [localPane, setLocalPane] = useState<'left' | 'right'>('left');
  const selectedPane = compactPane ?? localPane;
  const selectPane = (pane: 'left' | 'right') => {
    setLocalPane(pane);
    onCompactPaneChange?.(pane);
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = useState(INITIAL_LEFT_FRACTION);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const totalWidth = rect.width;
    const x = e.clientX - rect.left;

    const clampedX = Math.max(MIN_LEFT_PX, Math.min(x, totalWidth - MIN_RIGHT_PX));
    setLeftFraction(clampedX / totalWidth);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 gap-1 border-b p-2 @min-[800px]:hidden"
        role="group"
        aria-label="Application panels"
      >
        {(['left', 'right'] as const).map((pane) => (
          <button
            type="button"
            key={pane}
            onClick={() => selectPane(pane)}
            aria-pressed={selectedPane === pane}
            className={cn(
              'focus-visible:ring-ring min-h-10 flex-1 rounded-md px-3 text-sm focus-visible:ring-2',
              selectedPane === pane
                ? 'bg-accent text-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {pane === 'left' ? 'Conversation' : 'Workspace'}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="flex min-h-0 flex-1">
        {/* Left pane — flush with top bar, no internal header */}
        <div
          role="region"
          aria-label="Application conversation"
          className={cn(
            'min-h-0 min-w-0 shrink-0 basis-full flex-col overflow-hidden @min-[800px]:flex @min-[800px]:basis-(--left-pane-width)',
            selectedPane === 'left' ? 'flex' : 'hidden'
          )}
          style={{ '--left-pane-width': `${leftFraction * 100}%` } as CSSProperties}
        >
          {left}
        </div>

        {/* Divider — 1px line, hover thickens for grip */}
        <div
          role="separator"
          aria-orientation="vertical"
          className="group border-border hover:bg-primary/20 relative hidden w-px shrink-0 cursor-col-resize border-l transition-colors @min-[800px]:block"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* 8px wide invisible hit target centered on the 1px line */}
          <span className="absolute inset-y-0 -right-1 -left-1" />
        </div>

        {/* Right pane — flush with top bar, no internal header */}
        <div
          role="region"
          aria-label="Application workspace"
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col overflow-hidden @min-[800px]:flex',
            selectedPane === 'right' ? 'flex' : 'hidden'
          )}
        >
          {right}
        </div>
      </div>
    </div>
  );
}
