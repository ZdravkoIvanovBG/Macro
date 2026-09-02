/** Rounds and adds a thousands separator: 2145 -> "2,145". */
export function fmtInt(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** Trims trailing zeros: 2.0 -> "2", 2.50 -> "2.5". */
export function fmtDecimal(value: number, maxDecimals = 1): string {
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, '');
}

export function fmtGrams(value: number): string {
  return `${Math.round(value)}g`;
}

/** Renders a quantity the way it was entered: "150 g", "1.5 serving". */
export function fmtQuantity(quantity: number, unit: string): string {
  return `${fmtDecimal(quantity, 2)} ${unit}`;
}

/**
 * Parses a user-typed number, tolerating a comma decimal separator (common in
 * Bulgaria and most of Europe). Returns null when there is no usable number.
 */
export function parseNumber(input: string): number | null {
  const normalised = input.trim().replace(',', '.');
  if (normalised === '') return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}
