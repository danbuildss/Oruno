/** Money arrives as integer micro-dollars in strings (1 USD = 1,000,000). Never use floats for it. */
export function usd(micro: string | bigint): string {
  const value = typeof micro === "bigint" ? micro : BigInt(micro);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const dollars = abs / 1_000_000n;
  const cents = (abs % 1_000_000n) / 10_000n;
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

/** Share used, 0–100, for the progress bar (display only). */
export function percentUsed(spent: string, cap: string): number {
  const c = BigInt(cap);
  if (c <= 0n) return 0;
  const p = (BigInt(spent) * 100n) / c;
  return Number(p > 100n ? 100n : p);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
