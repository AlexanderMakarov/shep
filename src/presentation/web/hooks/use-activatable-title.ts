'use client';

import { useCallback } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * useActivatableTitle
 *
 * Makes a canvas card's TITLE keyboard-activatable, so a feature,
 * application, repository or cluster can be opened with Enter/Space and not
 * only with a mouse.
 *
 * The title carries the control, never the card: every node card contains
 * real `<button>` children (delete, chat, start, "+ New", …) and interactive
 * content nested inside an element with `role="button"` is invalid ARIA —
 * assistive tech flattens the card into one control and those buttons stop
 * being reachable. One activatable title per card keeps the "open this card"
 * affordance obvious and leaves the buttons traversable.
 *
 * `activate` receives the title element. A card whose open action is
 * mouse-only (React Flow drives feature cards through `onNodeClick`) can
 * re-emit a bubbling click from inside the card, so both input paths end in
 * the same handler instead of forking a second navigation route that could
 * drift from the mouse one.
 */

/**
 * Focus ring for an activatable title. Canvas cards hold no other focusable
 * text, so this ring is the only thing telling a keyboard user where they are.
 */
export const ACTIVATABLE_TITLE_CLASS =
  'focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none';

export interface ActivatableTitleProps {
  role: 'button';
  tabIndex: 0;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export function useActivatableTitle(
  activate: (titleElement: HTMLElement) => void
): ActivatableTitleProps {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // Space scrolls the canvas and both keys reach React Flow's own node
      // key handling — neither belongs to the open action.
      event.preventDefault();
      event.stopPropagation();
      activate(event.currentTarget);
    },
    [activate]
  );

  return { role: 'button', tabIndex: 0, onKeyDown };
}
