export const SEEDED_ROLES = {
  super_admin: {
    name: 'Super Admin',
    description: 'Full access to everything. Keep to very few accounts.',
  },
  stores_manager: {
    name: 'Stores Manager',
    description: 'Runs the stores and approves count differences.',
  },
  stores_keeper: {
    name: 'Stores Keeper',
    description: 'Receives, issues, holds, returns and counts stock.',
  },
  stock_viewer: {
    name: 'Stock Viewer',
    description: 'Looks up items, bins and stock levels.',
  },
} as const;

export type SeededRoleKey = keyof typeof SEEDED_ROLES;
