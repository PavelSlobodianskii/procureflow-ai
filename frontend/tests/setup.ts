import { afterEach } from "vitest";

// Component tests run in a simulated browser (jsdom). Plain Node tests skip this block.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
