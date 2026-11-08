import type { Server } from "node:http";

/** Types for server.mjs, so the TypeScript tests can import the mock. */
export function createMockServer(options?: { slowMs?: number; log?: (line: string) => void }): Server;
