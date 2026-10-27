/** Deeper offsets are never needed by the UI; larger numbers would overflow the database's bigint. */
const MAX_OFFSET = 1_000_000;

export function parsePagination(
  query: Record<string, unknown>,
  { defaultLimit = 50, maxLimit = 100 }: { defaultLimit?: number; maxLimit?: number } = {},
): { limit: number; offset: number } {
  const rawLimit = parseInt(String(query.limit ?? ""), 10);
  const rawOffset = parseInt(String(query.offset ?? ""), 10);
  return {
    limit: Math.min(Math.max(Number.isNaN(rawLimit) ? defaultLimit : rawLimit, 1), maxLimit),
    offset: Math.min(Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0), MAX_OFFSET),
  };
}
