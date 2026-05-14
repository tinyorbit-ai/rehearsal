import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom doesn't implement Element.scrollIntoView; stub it so components that
// auto-scroll active rows don't crash in tests.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// RTL's auto-cleanup only fires under jest-style globals; Vitest defaults to
// scoped imports, so we unmount manually after each test.
afterEach(() => {
  cleanup();
});

