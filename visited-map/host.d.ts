/**
 * Ambient types for the globals the page runtime installs in an App page.
 */
import type { SandboxPlayground } from "playground/hal/sandbox";

declare global {
  const playground: SandboxPlayground;
  const capabilities: Record<string, Record<string, (...args: never[]) => unknown>>;
}

export {};
