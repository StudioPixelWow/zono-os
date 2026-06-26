// Tiny presentational formatter shared by Resolution Center components.
export const fmtEvidenceConfidence = (c: number | null): string => (c == null ? "—" : `${Math.round(c * 100)}%`);
export const fmtDate = (iso: string): string => (iso ? iso.slice(0, 10) : "—");
