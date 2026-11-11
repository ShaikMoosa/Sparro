import type { Bucket } from "../bindings/Bucket";

/** Palette keys stored on categories, in the order the Figma colour picker shows them. */
export const PALETTE = ["blue", "purple", "violet", "green", "teal", "amber", "rose", "pink", "lime", "terracotta"] as const;
export type PaletteKey = (typeof PALETTE)[number];

export const PALETTE_LABELS: Record<PaletteKey, string> = {
  blue: "Blue",
  purple: "Purple",
  violet: "Violet",
  green: "Green",
  teal: "Teal",
  amber: "Amber",
  rose: "Rose",
  pink: "Pink",
  lime: "Lime",
  terracotta: "Terracotta",
};

export function isPaletteKey(c: string): c is PaletteKey {
  return (PALETTE as readonly string[]).includes(c);
}

/** Background + text colour for a category colour (palette key or custom hex). */
export function categoryColors(color: string): { bg: string; fg: string } {
  if (isPaletteKey(color)) return { bg: `var(--cat-${color}-bg)`, fg: `var(--cat-${color}-fg)` };
  if (/^#[0-9a-f]{6}$/i.test(color)) return { bg: `${color}33`, fg: "var(--text-category-initial)" };
  return { bg: "var(--surface-subtle)", fg: "var(--text-category-initial)" };
}

export function colorName(color: string): string {
  return isPaletteKey(color) ? PALETTE_LABELS[color] : color.toUpperCase();
}

export const BUCKETS: Bucket[] = ["needs", "wants", "savings"];

export const BUCKET_LABEL: Record<Bucket, string> = { needs: "Needs", wants: "Wants", savings: "Savings" };

export const BUCKET_DESCRIPTION: Record<Bucket, string> = {
  needs: "Essentials and regular commitments.",
  wants: "Lifestyle, leisure and the little extras.",
  savings: "Build your future, one goal at a time.",
};

export const BUCKET_BAR: Record<Bucket, string> = {
  needs: "var(--budget-needs)",
  wants: "var(--budget-wants)",
  savings: "var(--budget-savings)",
};
