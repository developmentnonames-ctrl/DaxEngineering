export { Prisma } from './generated/prisma/client';
export * from './generated/prisma/enums';
export * from './lib/prisma.service';
export type TransactionClient =
  import('./generated/prisma/client').Prisma.TransactionClient;
