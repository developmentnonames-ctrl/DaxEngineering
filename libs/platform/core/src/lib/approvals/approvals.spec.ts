import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type TransactionClient } from '@dax/platform-db';
import type { GrantScope } from '@dax/contracts';
import type { Policy } from '../acm/policy';
import type { AuditEntryInput, AuditService } from '../audit/audit.service';
import {
  type ApprovalRecord,
  ApprovalsService,
  type DecisionHandler,
} from './approvals.service';

const PERMISSION = 'inventory.count.approve';
const ENTITY = 'inventory.stock_count';
const keeper = 'user-keeper';
const manager = 'user-manager';
const storesDept = 'dept-stores';

function policy(
  userId: string,
  scope: GrantScope | null = 'ALL',
  departmentIds: string[] = [storesDept],
): Policy {
  const permissions = new Map(
    scope ? [[PERMISSION, { scope, storeIds: [] }]] : [],
  );
  return {
    userId,
    isSuperAdmin: false,
    require2fa: false,
    departmentIds,
    roleIds: [],
    enabledModules: new Set(['inventory']),
    permissions,
    sources: new Map(),
    denied: new Set(),
    fields: new Map(),
    validUntil: Number.MAX_SAFE_INTEGER,
    version: '1',
  };
}

type Where = Partial<
  Pick<ApprovalRecord, 'id' | 'entityKey' | 'entityId' | 'status' | 'version'>
>;

function matches(row: ApprovalRecord, where: Where): boolean {
  return Object.entries(where).every(
    ([k, v]) => row[k as keyof ApprovalRecord] === v,
  );
}

function fakeTx() {
  const rows: ApprovalRecord[] = [];
  let seq = 0;
  let failCreateWith: unknown = null;
  const approvalRequest = {
    findFirst: async ({ where }: { where: Where }) => {
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = rows.find((r) => r.id === where.id);
      return row ? { ...row } : null;
    },
    create: async ({ data }: { data: Partial<ApprovalRecord> }) => {
      if (failCreateWith) throw failCreateWith;
      seq += 1;
      const row: ApprovalRecord = {
        id: `req-${seq}`,
        moduleKey: '',
        entityKey: '',
        entityId: '',
        permissionKey: '',
        summary: '',
        requestedBy: '',
        departmentId: null,
        status: 'PENDING',
        requestedAt: new Date(),
        decidedBy: null,
        decidedAt: null,
        reason: null,
        version: 1,
        ...data,
      };
      rows.push(row);
      return { ...row };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Where;
      data: Partial<Omit<ApprovalRecord, 'version'>> & {
        version: { increment: number };
      };
    }) => {
      const hits = rows.filter((r) => matches(r, where));
      for (const row of hits) {
        const { version, ...rest } = data;
        Object.assign(row, rest, { version: row.version + version.increment });
      }
      return { count: hits.length };
    },
  };
  return {
    tx: { approvalRequest } as unknown as TransactionClient,
    rows,
    failCreate: (error: unknown) => {
      failCreateWith = error;
    },
  };
}

async function rejection(
  promise: Promise<unknown>,
): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus(): number; getResponse(): { code: string } };
    return { status: e.getStatus(), code: e.getResponse().code };
  }
  throw new Error('expected a rejection');
}

describe('ApprovalsService', () => {
  let audit: AuditEntryInput[];
  let service: ApprovalsService;
  let handler: ReturnType<typeof vi.fn<DecisionHandler>>;
  let fake: ReturnType<typeof fakeTx>;

  const requestInput = {
    moduleKey: 'inventory',
    entityKey: ENTITY,
    entityId: 'count-1',
    permissionKey: PERMISSION,
    summary: 'Cycle count, zone A',
    requestedBy: keeper,
    departmentId: storesDept,
  };

  beforeEach(() => {
    audit = [];
    const auditService = {
      record: async (entry: AuditEntryInput, tx?: TransactionClient) => {
        expect(tx).toBe(fake.tx);
        audit.push(entry);
      },
    } as unknown as AuditService;
    service = new ApprovalsService(auditService);
    handler = vi.fn<DecisionHandler>(async () => undefined);
    service.onDecided(ENTITY, handler);
    fake = fakeTx();
  });

  describe('request', () => {
    it('creates a pending request and audits it', async () => {
      const created = await service.request(fake.tx, requestInput);
      expect(created).toMatchObject({
        status: 'PENDING',
        version: 1,
        departmentId: storesDept,
      });
      expect(audit).toEqual([
        expect.objectContaining({
          entityKey: ENTITY,
          entityId: 'count-1',
          action: 'approval.requested',
          after: expect.objectContaining({
            approvalId: created.id,
            status: 'PENDING',
          }),
        }),
      ]);
    });

    it('allows only one pending request per document', async () => {
      await service.request(fake.tx, requestInput);
      expect(await rejection(service.request(fake.tx, requestInput))).toEqual({
        status: 409,
        code: 'APPROVAL_PENDING',
      });
      await service.request(fake.tx, { ...requestInput, entityId: 'count-2' });
    });

    it('maps a unique violation to a conflict', async () => {
      fake.failCreate(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.request(fake.tx, requestInput),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('needs a registered handler for the entity', async () => {
      await expect(
        service.request(fake.tx, {
          ...requestInput,
          entityKey: 'inventory.other',
        }),
      ).rejects.toThrow(/No approval handler registered for inventory.other/);
    });
  });

  describe('decide', () => {
    let pending: ApprovalRecord;
    beforeEach(async () => {
      pending = await service.request(fake.tx, requestInput);
      audit = [];
    });

    it('approves, bumps the version, calls the handler and audits', async () => {
      const decided = await service.decide(fake.tx, {
        id: pending.id,
        version: 1,
        decision: 'APPROVED',
        policy: policy(manager),
      });
      expect(decided).toMatchObject({
        status: 'APPROVED',
        decidedBy: manager,
        version: 2,
        reason: null,
      });
      expect(decided.decidedAt).toBeInstanceOf(Date);
      expect(fake.rows[0]).toMatchObject({ status: 'APPROVED', version: 2 });
      expect(handler).toHaveBeenCalledWith(fake.tx, decided);
      expect(audit).toEqual([
        expect.objectContaining({ action: 'approval.approved' }),
      ]);
    });

    it('rejects with a reason', async () => {
      const decided = await service.decide(fake.tx, {
        id: pending.id,
        version: 1,
        decision: 'REJECTED',
        reason: '  Recount bin A-03  ',
        policy: policy(manager),
      });
      expect(decided).toMatchObject({
        status: 'REJECTED',
        reason: 'Recount bin A-03',
      });
      expect(audit).toEqual([
        expect.objectContaining({
          action: 'approval.rejected',
          reason: 'Recount bin A-03',
        }),
      ]);
    });

    it('needs a reason to reject', async () => {
      for (const reason of [undefined, null, '', '   ']) {
        const result = service.decide(fake.tx, {
          id: pending.id,
          version: 1,
          decision: 'REJECTED',
          reason,
          policy: policy(manager),
        });
        await expect(result).rejects.toBeInstanceOf(BadRequestException);
        await expect(rejection(result)).resolves.toEqual({
          status: 400,
          code: 'REASON_REQUIRED',
        });
      }
      expect(fake.rows[0].status).toBe('PENDING');
    });

    it('refuses a stale version or a request that is no longer pending', async () => {
      const decide = (version: number) =>
        service.decide(fake.tx, {
          id: pending.id,
          version,
          decision: 'APPROVED',
          policy: policy(manager),
        });
      expect(await rejection(decide(2))).toEqual({
        status: 409,
        code: 'STALE',
      });
      await decide(1);
      expect(await rejection(decide(2))).toEqual({
        status: 409,
        code: 'STALE',
      });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('refuses when a concurrent decision wins the update', async () => {
      fake.tx.approvalRequest.updateMany = (async () => ({
        count: 0,
      })) as unknown as typeof fake.tx.approvalRequest.updateMany;
      expect(
        await rejection(
          service.decide(fake.tx, {
            id: pending.id,
            version: 1,
            decision: 'APPROVED',
            policy: policy(manager),
          }),
        ),
      ).toEqual({ status: 409, code: 'STALE' });
      expect(handler).not.toHaveBeenCalled();
      expect(audit).toEqual([]);
    });

    it('needs the approval permission', async () => {
      expect(
        await rejection(
          service.decide(fake.tx, {
            id: pending.id,
            version: 1,
            decision: 'APPROVED',
            policy: policy(manager, null),
          }),
        ),
      ).toEqual({ status: 403, code: 'PERMISSION_DENIED' });
    });

    it('never lets the requester decide', async () => {
      const result = service.decide(fake.tx, {
        id: pending.id,
        version: 1,
        decision: 'APPROVED',
        policy: policy(keeper, 'ALL'),
      });
      await expect(result).rejects.toBeInstanceOf(ForbiddenException);
      expect(await rejection(result)).toEqual({
        status: 403,
        code: 'SELF_APPROVAL',
      });
    });

    it('limits department scope to the decider’s departments', async () => {
      const decide = (p: Policy) =>
        service.decide(fake.tx, {
          id: pending.id,
          version: 1,
          decision: 'APPROVED',
          policy: p,
        });
      expect(
        await rejection(
          decide(policy(manager, 'DEPARTMENT', ['dept-workshop'])),
        ),
      ).toEqual({
        status: 403,
        code: 'OUT_OF_SCOPE',
      });
      expect(await rejection(decide(policy(manager, 'OWN')))).toEqual({
        status: 403,
        code: 'OUT_OF_SCOPE',
      });
      await expect(
        decide(policy(manager, 'DEPARTMENT')),
      ).resolves.toMatchObject({
        status: 'APPROVED',
      });
    });

    it('treats a request without a department as outside department scope', async () => {
      const other = await service.request(fake.tx, {
        ...requestInput,
        entityId: 'count-2',
        departmentId: null,
      });
      expect(
        await rejection(
          service.decide(fake.tx, {
            id: other.id,
            version: 1,
            decision: 'APPROVED',
            policy: policy(manager, 'DEPARTMENT'),
          }),
        ),
      ).toEqual({ status: 403, code: 'OUT_OF_SCOPE' });
    });

    it('returns not found for an unknown id', async () => {
      await expect(
        service.decide(fake.tx, {
          id: 'missing',
          version: 1,
          decision: 'APPROVED',
          policy: policy(manager),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates a handler failure so the transaction rolls back', async () => {
      handler.mockRejectedValueOnce(new Error('count already posted'));
      await expect(
        service.decide(fake.tx, {
          id: pending.id,
          version: 1,
          decision: 'APPROVED',
          policy: policy(manager),
        }),
      ).rejects.toThrow('count already posted');
    });
  });

  describe('cancel', () => {
    let pending: ApprovalRecord;
    beforeEach(async () => {
      pending = await service.request(fake.tx, requestInput);
      audit = [];
    });

    it('lets the requester cancel without the permission', async () => {
      const cancelled = await service.cancel(fake.tx, {
        id: pending.id,
        version: 1,
        by: policy(keeper, null),
      });
      expect(cancelled).toMatchObject({
        status: 'CANCELLED',
        decidedBy: keeper,
        version: 2,
      });
      expect(audit).toEqual([
        expect.objectContaining({ action: 'approval.cancelled' }),
      ]);
      expect(handler).not.toHaveBeenCalled();
    });

    it('lets a permission holder in scope cancel', async () => {
      await expect(
        service.cancel(fake.tx, {
          id: pending.id,
          version: 1,
          by: policy(manager, 'DEPARTMENT'),
        }),
      ).resolves.toMatchObject({ status: 'CANCELLED', decidedBy: manager });
    });

    it('refuses anyone else, and stale versions', async () => {
      expect(
        await rejection(
          service.cancel(fake.tx, {
            id: pending.id,
            version: 1,
            by: policy('user-x', null),
          }),
        ),
      ).toEqual({ status: 403, code: 'PERMISSION_DENIED' });
      expect(
        await rejection(
          service.cancel(fake.tx, {
            id: pending.id,
            version: 7,
            by: policy(keeper),
          }),
        ),
      ).toEqual({ status: 409, code: 'STALE' });
      expect(fake.rows[0].status).toBe('PENDING');
    });
  });

  it('refuses a second handler for the same entity', () => {
    expect(() => service.onDecided(ENTITY, handler)).toThrow(
      /already registered/,
    );
  });
});
