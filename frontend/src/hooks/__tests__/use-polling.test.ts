import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePolling } from '../use-polling';

/** Helper to toggle document.hidden and dispatch visibilitychange */
function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('usePolling hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset document.hidden to false (visible) by default
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore document.hidden to false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  test('calls callback at the specified interval', () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000));

    // Should not have been called immediately
    expect(callback).not.toHaveBeenCalled();

    // Advance 1 interval
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    // Advance another interval
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('does not call callback when document is hidden', () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000));

    // Hide the document
    setDocumentHidden(true);

    // Advance past several intervals
    vi.advanceTimersByTime(3000);
    expect(callback).not.toHaveBeenCalled();
  });

  test('calls callback immediately when visibility changes back to visible', () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 5000));

    // Hide then show
    setDocumentHidden(true);
    expect(callback).not.toHaveBeenCalled();

    setDocumentHidden(false);
    // Callback should fire on visibility change back to visible
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('does not call callback when visibility changes but stays hidden', () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 5000));

    // Start hidden
    setDocumentHidden(true);
    // Dispatch visibilitychange again while still hidden
    setDocumentHidden(true);

    expect(callback).not.toHaveBeenCalled();
  });

  test('cleans up interval on unmount', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => usePolling(callback, 1000));

    unmount();

    // Advance timers after unmount — callback should not fire
    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });

  test('cleans up visibilitychange event listener on unmount', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => usePolling(callback, 1000));

    unmount();

    // After unmount, dispatching visibilitychange should not call callback
    setDocumentHidden(false);
    expect(callback).not.toHaveBeenCalled();
  });

  test('respects updated interval when deps change', () => {
    const callback = vi.fn();
    let interval = 1000;
    const { rerender } = renderHook(() => usePolling(callback, interval, [interval]));

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    // Change interval
    interval = 2000;
    rerender();

    vi.advanceTimersByTime(1000);
    // Old interval was 1000, but after change it should be 2000
    // The 1000ms advance should not trigger because the new interval is 2000
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    // Now total 2000ms since rerender — should fire
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
