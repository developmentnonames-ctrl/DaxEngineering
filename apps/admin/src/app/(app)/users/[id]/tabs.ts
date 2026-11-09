export const USER_TABS = [
  'profile',
  'access',
  'overrides',
  'effective',
] as const;
export type UserTab = (typeof USER_TABS)[number];
