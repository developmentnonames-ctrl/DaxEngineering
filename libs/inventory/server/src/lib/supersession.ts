export const MAX_CHAIN = 100;

export type NextOf = (id: string) => Promise<string | null>;

export async function latestReplacementId(
  supersededById: string | null,
  nextOf: NextOf,
): Promise<string | null> {
  if (!supersededById) return null;
  const seen = new Set<string>();
  let current = supersededById;
  for (let hop = 0; hop < MAX_CHAIN; hop++) {
    seen.add(current);
    const next = await nextOf(current);
    if (!next || seen.has(next)) return current;
    current = next;
  }
  return current;
}

export async function createsCycle(
  itemId: string,
  replacementId: string,
  nextOf: NextOf,
): Promise<boolean> {
  if (itemId === replacementId) return true;
  const seen = new Set<string>([replacementId]);
  let current: string | null = replacementId;
  for (let hop = 0; hop < MAX_CHAIN && current; hop++) {
    const next: string | null = await nextOf(current);
    if (!next) return false;
    if (next === itemId || seen.has(next)) return true;
    seen.add(next);
    current = next;
  }
  return current !== null;
}
