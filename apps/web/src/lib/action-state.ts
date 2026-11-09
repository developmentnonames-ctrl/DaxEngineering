export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
  href?: string;
  fields?: Record<string, string>;
}

export const IDLE: ActionState = { ok: false };

export function fieldError(
  state: ActionState,
  field: string,
): string | undefined {
  return state.fields?.[field];
}
