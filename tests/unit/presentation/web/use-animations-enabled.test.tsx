/**
 * `useAnimationsEnabled` must honour the OS-level reduce-motion setting, while
 * still letting an EXPLICIT stored choice win over it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimationsEnabled } from '@/hooks/use-animations-enabled';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  onchange: null;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

let lists: Map<string, FakeMediaQueryList>;

/** Installs a matchMedia whose `(prefers-reduced-motion: reduce)` result is controllable. */
function installMatchMedia(prefersReduce: boolean) {
  lists = new Map();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const existing = lists.get(query);
      if (existing) return existing;
      const list: FakeMediaQueryList = {
        matches: query === REDUCE_QUERY ? prefersReduce : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      };
      lists.set(query, list);
      return list;
    })
  );
}

function emitChange(matches: boolean) {
  const list = lists.get(REDUCE_QUERY);
  if (!list) throw new Error('the hook never subscribed to the reduce-motion query');
  for (const [, handler] of list.addEventListener.mock.calls) {
    (handler as (e: { matches: boolean }) => void)({ matches });
  }
}

function setStored(value: string | null) {
  vi.mocked(localStorage.getItem).mockReturnValue(value);
}

beforeEach(() => {
  document.body.className = '';
  vi.mocked(localStorage.getItem).mockReset();
  vi.mocked(localStorage.setItem).mockReset();
  setStored(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.className = '';
});

describe('useAnimationsEnabled — OS reduced motion (A9)', () => {
  it('starts disabled when the OS asks for reduced motion and nothing is stored', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useAnimationsEnabled());

    expect(result.current.enabled).toBe(false);
    expect(document.body.classList.contains('no-animations')).toBe(true);
  });

  it('starts enabled when the OS has no preference and nothing is stored', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useAnimationsEnabled());

    expect(result.current.enabled).toBe(true);
    expect(document.body.classList.contains('no-animations')).toBe(false);
  });

  it('lets an explicit stored "on" beat the OS preference', () => {
    installMatchMedia(true);
    setStored('true');
    const { result } = renderHook(() => useAnimationsEnabled());

    expect(result.current.enabled).toBe(true);
    expect(document.body.classList.contains('no-animations')).toBe(false);
    // The CSS first-paint block is media-query driven, so an explicit opt-in
    // needs a marker class to override it.
    expect(document.body.classList.contains('animations-forced')).toBe(true);
  });

  it('lets an explicit stored "off" survive an OS with no preference', () => {
    installMatchMedia(false);
    setStored('false');
    const { result } = renderHook(() => useAnimationsEnabled());

    expect(result.current.enabled).toBe(false);
    expect(document.body.classList.contains('no-animations')).toBe(true);
  });

  it('reacts to the OS preference changing while mounted', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useAnimationsEnabled());
    expect(result.current.enabled).toBe(true);

    act(() => emitChange(true));

    expect(result.current.enabled).toBe(false);
    expect(document.body.classList.contains('no-animations')).toBe(true);
  });

  it('ignores OS preference changes once the user has chosen explicitly', () => {
    installMatchMedia(false);
    setStored('true');
    const { result } = renderHook(() => useAnimationsEnabled());

    act(() => emitChange(true));

    expect(result.current.enabled).toBe(true);
  });

  it('removes the media-query listener on unmount', () => {
    installMatchMedia(false);
    const { unmount } = renderHook(() => useAnimationsEnabled());

    const list = lists.get(REDUCE_QUERY);
    expect(list?.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();

    expect(list?.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('toggle still persists an explicit choice and marks the override', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useAnimationsEnabled());
    expect(result.current.enabled).toBe(false);

    act(() => result.current.toggle());

    expect(result.current.enabled).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith('shep-animations-enabled', 'true');
    expect(document.body.classList.contains('no-animations')).toBe(false);
    expect(document.body.classList.contains('animations-forced')).toBe(true);
  });

  it('does not crash when matchMedia is unavailable (SSR-ish environments)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(() => renderHook(() => useAnimationsEnabled())).not.toThrow();
  });
});
