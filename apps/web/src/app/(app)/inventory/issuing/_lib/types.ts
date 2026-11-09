export type CodeMatch =
  | { type: 'bin'; bin: { id: string; code: string } }
  | { type: 'part'; itemIds: string[] }
  | { type: 'none' }
  | { type: 'error'; message: string };
