import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TransactionClient } from '@dax/platform-db';
import { can, grantOf, type Policy } from '../acm/policy';
import { AuditService } from '../audit/audit.service';

export type ApprovalRecord = Prisma.ApprovalRequestModel;
export type ApprovalDecision = 'APPROVED' | 'REJECTED';
export type DecisionHandler = (
  tx: TransactionClient,
  request: ApprovalRecord,
) => Promise<void>;

export interface RequestApprovalInput {
  moduleKey: string;
  entityKey: string;
  entityId: string;
  permissionKey: string;
  summary: string;
  requestedBy: string;
  departmentId?: string | null;
}

export interface DecideInput {
  id: string;
  version: number;
  decision: ApprovalDecision;
  reason?: string | null;
  policy: Policy;
}

export interface CancelInput {
  id: string;
  version: number;
  by: Policy;
}

function stale(): ConflictException {
  return new ConflictException({
    code: 'STALE',
    message:
      'This request has changed since you opened it. Reload and try again.',
  });
}

function forbidden(code: string, message: string): ForbiddenException {
  return new ForbiddenException({ code, message });
}

function assertActsOn(policy: Policy, request: ApprovalRecord): void {
  if (!can(policy, request.permissionKey)) {
    throw forbidden('PERMISSION_DENIED', "You don't have access to this.");
  }
  const scope = grantOf(policy, request.permissionKey)?.scope;
  if (scope === 'ALL') return;
  if (
    scope === 'DEPARTMENT' &&
    request.departmentId !== null &&
    policy.departmentIds.includes(request.departmentId)
  ) {
    return;
  }
  throw forbidden('OUT_OF_SCOPE', 'This request is outside your scope.');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class ApprovalsService {
  private readonly handlers = new Map<string, DecisionHandler>();

  constructor(private readonly audit: AuditService) {}

  onDecided(entityKey: string, handler: DecisionHandler): void {
    if (this.handlers.has(entityKey)) {
      throw new Error(
        `An approval handler for ${entityKey} is already registered`,
      );
    }
    this.handlers.set(entityKey, handler);
  }

  async request(
    tx: TransactionClient,
    input: RequestApprovalInput,
  ): Promise<ApprovalRecord> {
    this.handlerFor(input.entityKey);
    const pending = await tx.approvalRequest.findFirst({
      where: {
        entityKey: input.entityKey,
        entityId: input.entityId,
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (pending) throw this.alreadyPending();
    let created: ApprovalRecord;
    try {
      created = await tx.approvalRequest.create({
        data: {
          moduleKey: input.moduleKey,
          entityKey: input.entityKey,
          entityId: input.entityId,
          permissionKey: input.permissionKey,
          summary: input.summary,
          requestedBy: input.requestedBy,
          departmentId: input.departmentId ?? null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.alreadyPending();
      throw error;
    }
    await this.record(tx, created, 'approval.requested');
    return created;
  }

  async decide(
    tx: TransactionClient,
    input: DecideInput,
  ): Promise<ApprovalRecord> {
    const reason = input.reason?.trim() || null;
    if (input.decision === 'REJECTED' && !reason) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'Give a reason for the rejection.',
      });
    }
    const current = await this.load(tx, input.id, input.version);
    const handler = this.handlerFor(current.entityKey);
    assertActsOn(input.policy, current);
    if (current.requestedBy === input.policy.userId) {
      throw forbidden('SELF_APPROVAL', "You can't decide on your own request.");
    }
    const decided = await this.transition(tx, current, {
      status: input.decision,
      decidedBy: input.policy.userId,
      reason,
    });
    await handler(tx, decided);
    await this.record(tx, decided, `approval.${input.decision.toLowerCase()}`);
    return decided;
  }

  async cancel(
    tx: TransactionClient,
    input: CancelInput,
  ): Promise<ApprovalRecord> {
    const current = await this.load(tx, input.id, input.version);
    if (current.requestedBy !== input.by.userId)
      assertActsOn(input.by, current);
    const cancelled = await this.transition(tx, current, {
      status: 'CANCELLED',
      decidedBy: input.by.userId,
      reason: null,
    });
    await this.record(tx, cancelled, 'approval.cancelled');
    return cancelled;
  }

  private handlerFor(entityKey: string): DecisionHandler {
    const handler = this.handlers.get(entityKey);
    if (!handler)
      throw new Error(`No approval handler registered for ${entityKey}`);
    return handler;
  }

  private alreadyPending(): ConflictException {
    return new ConflictException({
      code: 'APPROVAL_PENDING',
      message: 'This document is already waiting for approval.',
    });
  }

  private async load(
    tx: TransactionClient,
    id: string,
    version: number,
  ): Promise<ApprovalRecord> {
    const current = await tx.approvalRequest.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    }
    if (current.status !== 'PENDING' || current.version !== version)
      throw stale();
    return current;
  }

  private async transition(
    tx: TransactionClient,
    current: ApprovalRecord,
    change: Pick<ApprovalRecord, 'status' | 'decidedBy' | 'reason'>,
  ): Promise<ApprovalRecord> {
    const decidedAt = new Date();
    const { count } = await tx.approvalRequest.updateMany({
      where: { id: current.id, version: current.version, status: 'PENDING' },
      data: { ...change, decidedAt, version: { increment: 1 } },
    });
    if (count === 0) throw stale();
    return { ...current, ...change, decidedAt, version: current.version + 1 };
  }

  private record(
    tx: TransactionClient,
    request: ApprovalRecord,
    action: string,
  ): Promise<void> {
    return this.audit.record(
      {
        moduleKey: request.moduleKey,
        entityKey: request.entityKey,
        entityId: request.entityId,
        action,
        after: {
          approvalId: request.id,
          permissionKey: request.permissionKey,
          status: request.status,
          summary: request.summary,
          version: request.version,
        },
        reason: request.reason,
      },
      tx,
    );
  }
}
