import { inTauri } from "../api/client";

type Filter = { name: string; extensions: string[] };

/** Windows "Save as" dialog. Returns the chosen path, or null if cancelled. */
export async function chooseSavePath(defaultPath: string, filters: Filter[]): Promise<string | null> {
  // In the browser preview the mock backend downloads the file instead.
  if (!inTauri) return defaultPath;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath, filters });
}

/** Windows "Open" dialog for a single file. Returns the path, or null if cancelled. */
export async function chooseOpenPath(filters: Filter[]): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: false, directory: false, filters });
  return typeof picked === "string" ? picked : null;
}

/** "C:\Users\me\Documents\backup.sparro" → "backup.sparro" */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export const BACKUP_FILTER: Filter = { name: "Sparro backup", extensions: ["sparro"] };
export const CSV_FILTER: Filter = { name: "CSV (Excel)", extensions: ["csv"] };
