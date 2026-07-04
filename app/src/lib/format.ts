export function vsPar(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}

// Chip class for a hole's score relative to par (eagle/birdie/par/bogey/double/triple+)
export function chipClass(diff: number | null): string {
  if (diff === null) return "ch-x";
  if (diff <= -2) return "ch-E";
  if (diff === -1) return "ch-B";
  if (diff === 0) return "ch-P";
  if (diff === 1) return "ch-1";
  if (diff === 2) return "ch-2";
  return "ch-3";
}

export function firstName(displayName: string): string {
  return displayName.split(/[ ,]/)[0];
}
