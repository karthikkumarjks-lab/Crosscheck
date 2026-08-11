import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Not using vitest's `globals: true` (matches the rest of the repo's
// explicit-import test style), so React Testing Library's automatic
// afterEach(cleanup) registration doesn't fire on its own -- registered
// explicitly here instead, once, for every test file in this package.
afterEach(cleanup);
