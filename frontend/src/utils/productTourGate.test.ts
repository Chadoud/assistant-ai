import { describe, expect, it, beforeEach, vi } from "vitest";
import { TOUR_COMPLETED_STORAGE_KEY } from "../constants";
import { isFirstRunProductTourPending, readProductTourCompleted, shouldDeferProductTourAutoOpen } from "./productTourGate";

describe("productTourGate", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    });
  });

  it("blocks assistant auto-prompts only while the tour overlay is open", () => {
    expect(
      isFirstRunProductTourPending({
        hydrated: true,
        showWelcome: false,
        needsCloudAccount: false,
        launchSphereSplashOpen: false,
        tourOpen: false,
      })
    ).toBe(false);
    expect(
      isFirstRunProductTourPending({
        hydrated: true,
        showWelcome: false,
        needsCloudAccount: false,
        launchSphereSplashOpen: false,
        tourOpen: true,
      })
    ).toBe(true);
  });

  it("does not block when tour was never completed but overlay is closed", () => {
    expect(readProductTourCompleted()).toBe(false);
    expect(
      isFirstRunProductTourPending({
        hydrated: true,
        showWelcome: false,
        needsCloudAccount: false,
        launchSphereSplashOpen: false,
        tourOpen: false,
      })
    ).toBe(false);
  });

  it("blocks while tour overlay is open even when completed before", () => {
    storage.set(TOUR_COMPLETED_STORAGE_KEY, "1");
    expect(
      isFirstRunProductTourPending({
        hydrated: true,
        showWelcome: false,
        needsCloudAccount: false,
        launchSphereSplashOpen: false,
        tourOpen: true,
      })
    ).toBe(true);
  });
});

describe("shouldDeferProductTourAutoOpen", () => {
  const base = {
    showWelcome: false,
    needsCloudAccount: false,
    launchSphereSplashOpen: false,
    isDesktopManaged: true,
    backendOnline: true,
  };

  it("defers during welcome or local service boot on desktop", () => {
    expect(shouldDeferProductTourAutoOpen({ ...base, showWelcome: true })).toBe(true);
    expect(shouldDeferProductTourAutoOpen({ ...base, backendOnline: false })).toBe(true);
    expect(shouldDeferProductTourAutoOpen({ ...base, launchSphereSplashOpen: true })).toBe(true);
  });

  it("allows auto-open on web without backend", () => {
    expect(
      shouldDeferProductTourAutoOpen({
        ...base,
        isDesktopManaged: false,
        backendOnline: false,
      })
    ).toBe(false);
  });

  it("allows auto-open on desktop once backend is online", () => {
    expect(shouldDeferProductTourAutoOpen(base)).toBe(false);
  });
});
