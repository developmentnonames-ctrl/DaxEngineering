import { Injectable, NotFoundException } from '@nestjs/common';
import type { TransactionClient } from '@dax/platform-db';
import type { Policy } from '../acm/policy';

export interface AttachmentAccess {
  moduleKey: string;
  canView(
    policy: Policy,
    entityId: string,
    tx?: TransactionClient,
  ): Promise<boolean>;
  canAttach(policy: Policy, entityId: string): Promise<boolean>;
}

export function attachmentNotFound(): never {
  throw new NotFoundException({
    code: 'NOT_FOUND',
    message: 'File not found.',
  });
}

@Injectable()
export class AttachmentAccessRegistry {
  private readonly resolvers = new Map<string, AttachmentAccess>();

  register(entityKey: string, access: AttachmentAccess): void {
    if (!entityKey.startsWith(`${access.moduleKey}.`)) {
      throw new Error(
        `Attachment entity "${entityKey}" must start with its module key "${access.moduleKey}."`,
      );
    }
    if (this.resolvers.has(entityKey)) {
      throw new Error(
        `Attachment access for "${entityKey}" is already registered`,
      );
    }
    this.resolvers.set(entityKey, access);
  }

  resolve(entityKey: string): AttachmentAccess {
    return this.resolvers.get(entityKey) ?? attachmentNotFound();
  }
}
