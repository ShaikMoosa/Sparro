import { invoke } from "@tauri-apps/api/core";

export type ApiError = { kind: "validation" | "not_found" | "conflict" | "database" | "internal"; message: string };

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Call a Rust command. Outside the desktop app (plain `npm run dev` in a browser)
 * an in-memory mock with the design's sample data is used, so screens can be
 * reviewed against Figma without the Rust backend.
 */
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return invoke<T>(cmd, args);
  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    const { mockInvoke } = await import("./mock");
    return mockInvoke(cmd, args) as Promise<T>;
  }
  throw { kind: "internal", message: "Sparro must be run as the desktop app." } satisfies ApiError;
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as ApiError).message);
  if (typeof e === "string") return e;
  return "Something went wrong. Please try again.";
}
