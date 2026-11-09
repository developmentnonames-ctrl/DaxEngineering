import { ConflictException, ForbiddenException } from '@nestjs/common';
import { grantOf, type Policy } from '@dax/platform-core';
import type { Prisma, TransactionClient } from '@dax/platform-db';
import { canRead, conflict, invalid } from '../common';
import { holdEntity, mrnEntity } from '../entities';
import type { Db } from '../receiving/shared';
import type { MrnStatus } from './rules';

export const HOLD_KEY = 'inventory.hold';
export const MRN_KEY = 'inventory.mrn';
export const AOD_KEY = 'inventory.aod';

export const MRN_RELEASE_GATES = Symbol.for('dax.inventory.mrn-release-gates');

export interface GateMrn {
  id: string;
  number: string | null;
  subtype: string;
  departmentId: string;
  customerId: string | null;
}

export interface MrnReleaseGate {
  name: string;
  check(
    tx: TransactionClient,
    mrn: GateMrn,
  ): Promise<{ ok: boolean; reason?: string }>;
}

export async function failedGates(
  gates: readonly MrnReleaseGate[],
  tx: TransactionClient,
  mrn: GateMrn,
): Promise<{ gate: string; reason: string | null }[]> {
  const failed: { gate: string; reason: string | null }[] = [];
  for (const gate of gates) {
    const result = await gate.check(tx, mrn);
    if (!result.ok)
      failed.push({ gate: gate.name, reason: result.reason ?? null });
  }
  return failed;
}

type Scope = { own: true } | { departments: string[] } | null;

function scopeOf(policy: Policy, permission: string): Scope {
  const grant = grantOf(policy, permission);
  if (!grant) {
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: "You don't have access to this.",
    });
  }
  if (grant.scope === 'OWN') return { own: true };
  if (grant.scope === 'DEPARTMENT')
    return { departments: [...policy.departmentIds] };
  return null;
}

export function holdScope(policy: Policy): Prisma.HoldWhereInput {
  const scope = scopeOf(policy, 'inventory.hold.view');
  if (!scope) return {};
  return 'own' in scope
    ? { createdBy: policy.userId }
    : { departmentId: { in: scope.departments } };
}

export function mrnScope(
  policy: Policy,
  permission = 'inventory.mrn.view',
): Prisma.MrnWhereInput {
  const scope = scopeOf(policy, permission);
  if (!scope) return {};
  return 'own' in scope
    ? { createdBy: policy.userId }
    : { departmentId: { in: scope.departments } };
}

export function aodScope(policy: Policy): Prisma.AodWhereInput {
  const mrn = mrnScope(policy, 'inventory.aod.view');
  return Object.keys(mrn).length === 0 ? {} : { mrn };
}

export function seesHoldCustomer(policy: Policy): boolean {
  return canRead(policy, holdEntity, 'customerName');
}

export function seesMrnCustomer(policy: Policy): boolean {
  return canRead(policy, mrnEntity, 'customerName');
}

export function customerRef(
  visible: boolean,
  row: { customerId: string | null; customerName: string | null },
): { customer?: { id: string; name: string } | null } {
  if (!visible) return {};
  return {
    customer:
      row.customerId && row.customerName
        ? { id: row.customerId, name: row.customerName }
        : null,
  };
}

export async function activeDepartment(db: Db, departmentId: string) {
  const row = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, active: true },
  });
  if (!row?.active) invalid('Choose an active department.', ['departmentId']);
  return row;
}

export async function activeCustomer(
  db: Db,
  customerId: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (!customerId) return null;
  const row = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, active: true },
  });
  if (!row?.active) invalid('Choose an active customer.', ['customerId']);
  return { id: row.id, name: row.name };
}

export async function lockMrn(
  tx: TransactionClient,
  mrnId: string,
): Promise<MrnStatus | null> {
  const [row] = await tx.$queryRaw<{ status: MrnStatus }[]>`
    SELECT status::text AS status FROM inventory.mrn WHERE id = ${mrnId}::uuid FOR UPDATE`;
  return row?.status ?? null;
}

export function errorCode(error: unknown): string | null {
  if (!(error instanceof ConflictException)) return null;
  const body = error.getResponse();
  return typeof body === 'object' &&
    typeof (body as { code?: unknown }).code === 'string'
    ? (body as { code: string }).code
    : null;
}

export function errorItemId(error: unknown): string | null {
  if (!(error instanceof ConflictException)) return null;
  const body = error.getResponse() as { itemId?: unknown };
  return typeof body.itemId === 'string' ? body.itemId : null;
}

export function notEnoughFor(partNo: string, free: string | null): never {
  conflict(
    'NOT_ENOUGH_FREE_STOCK',
    free === null
      ? `There is not enough free stock of ${partNo}.`
      : `Only ${free} of ${partNo} is free.`,
  );
}
