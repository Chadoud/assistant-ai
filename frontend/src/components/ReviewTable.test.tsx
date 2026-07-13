// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import ReviewTable from "./ReviewTable";
import { I18nProvider } from "../i18n/I18nContext";
import type { FileEntry } from "../api";

const sampleRows: FileEntry[] = [
  {
    path: "/tmp/invoice.pdf",
    name: "invoice.pdf",
    confidence: 0.95,
    approved: false,
    suggested_folder: "Invoices",
    final_folder: "Invoices",
  } as FileEntry,
];

describe("ReviewTable", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("1280px") ? false : query.includes("640px") ? false : false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders review filters and file row", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <ReviewTable
            rows={sampleRows}
            onToggleApproved={vi.fn()}
            onEditFolder={vi.fn()}
            jobId="job-1"
            telemetryOptIn={false}
            uiLocale="en"
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Confidence");
    expect(container.textContent).toContain("Search by file name");
  });
});
