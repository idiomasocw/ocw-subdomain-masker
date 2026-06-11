/**
 * Extracts the leftmost dot-delimited label from a hostname.
 * Returns null for apex domains (no dot) or empty input.
 */
export function extractSubdomain(hostname: string): string | null {
  if (!hostname) return null;
  const dot = hostname.indexOf(".");
  if (dot === -1) return null;
  const label = hostname.slice(0, dot);
  return label || null;
}
