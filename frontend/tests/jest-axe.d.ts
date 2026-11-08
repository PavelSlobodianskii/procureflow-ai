// jest-axe ships without TypeScript types. This minimal declaration covers only what the tests use,
// so no extra @types package is needed.
declare module "jest-axe" {
  export interface AxeViolation {
    id: string;
    impact?: string | null;
    help: string;
    nodes: unknown[];
  }
  export interface AxeResults {
    violations: AxeViolation[];
  }
  export function axe(element: Element, options?: Record<string, unknown>): Promise<AxeResults>;
}
