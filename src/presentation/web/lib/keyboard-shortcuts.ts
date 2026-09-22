/** Match the assigned chord without taking over a handled event or text composition. */
export function matchesGlobalShortcut(
  event: KeyboardEvent,
  key: string,
  { shift = false }: { shift?: boolean } = {}
): boolean {
  return (
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.altKey &&
    event.shiftKey === shift &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === key.toLowerCase()
  );
}
