import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosave } from "../useAutosave.js";
import { storage } from "../../utils/storage.js";

describe("useAutosave", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not persist anything before the debounce delay elapses", () => {
    const { rerender } = renderHook(
      ({ value }) =>
        useAutosave({ screen: "new-part", entityId: "new", value, delay: 500 }),
      { initialProps: { value: { name: "" } } },
    );
    // Change the value once so the autosave effect has something to debounce.
    rerender({ value: { name: "Widget" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(storage.drafts.get("new-part", "new")).toBeNull();
  });

  it("debounce-persists the latest value after the delay", () => {
    const { rerender } = renderHook(
      ({ value }) =>
        useAutosave({ screen: "new-part", entityId: "new", value, delay: 500 }),
      { initialProps: { value: { name: "" } } },
    );
    rerender({ value: { name: "Widget" } });
    // A rapid second change should reset the debounce window.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ value: { name: "Widget v2" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(storage.drafts.get("new-part", "new")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    const saved = storage.drafts.get("new-part", "new");
    expect(saved).not.toBeNull();
    expect(saved.value).toEqual({ name: "Widget v2" });
  });

  it("restores an existing draft synchronously on mount", () => {
    storage.drafts.set("bom-editor", "bom-42", { rows: [{ id: "r1", qty: 2 }] });

    const { result } = renderHook(() =>
      useAutosave({ screen: "bom-editor", entityId: "bom-42", value: null }),
    );

    expect(result.current.hasDraft).toBe(true);
    expect(result.current.draftValue).toEqual({
      rows: [{ id: "r1", qty: 2 }],
    });
    expect(result.current.restoredAt).toEqual(expect.any(Number));
  });

  it("reports no draft when none was ever saved", () => {
    const { result } = renderHook(() =>
      useAutosave({ screen: "new-part", entityId: "new", value: {} }),
    );
    expect(result.current.hasDraft).toBe(false);
    expect(result.current.draftValue).toBeNull();
  });

  it("clearDraft wipes the stored draft and resets restore state", () => {
    storage.drafts.set("new-part", "new", { name: "Leftover" });
    const { result } = renderHook(() =>
      useAutosave({ screen: "new-part", entityId: "new", value: {} }),
    );
    expect(result.current.hasDraft).toBe(true);

    act(() => {
      result.current.clearDraft();
    });

    expect(storage.drafts.get("new-part", "new")).toBeNull();
    expect(result.current.hasDraft).toBe(false);
    expect(result.current.draftValue).toBeNull();
  });

  it("discardDraft also wipes the stored draft (user opted out of restoring)", () => {
    storage.drafts.set("new-part", "new", { name: "Leftover" });
    const { result } = renderHook(() =>
      useAutosave({ screen: "new-part", entityId: "new", value: {} }),
    );

    act(() => {
      result.current.discardDraft();
    });

    expect(storage.drafts.get("new-part", "new")).toBeNull();
    expect(result.current.hasDraft).toBe(false);
  });

  it("does not persist or restore when disabled", () => {
    storage.drafts.set("new-part", "new", { name: "Should be ignored" });
    const { result, rerender } = renderHook(
      ({ value }) =>
        useAutosave({
          screen: "new-part",
          entityId: "new",
          value,
          enabled: false,
          delay: 100,
        }),
      { initialProps: { value: { name: "" } } },
    );
    expect(result.current.hasDraft).toBe(false);

    rerender({ value: { name: "typed while disabled" } });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const stored = storage.drafts.get("new-part", "new");
    expect(stored.value).toEqual({ name: "Should be ignored" });
  });
});
