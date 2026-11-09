import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PrismaService } from '@dax/platform-db';
import type { Policy } from '../acm/policy';
import { AuditService } from '../audit/audit.service';
import {
  type AttachmentAccess,
  AttachmentAccessRegistry,
  attachmentNotFound,
} from './access-registry';
import {
  MAX_UPLOAD_BYTES,
  sanitizeFileName,
  sniffContentType,
} from './content-type';
import type { ObjectStore } from './object-store';

export const OBJECT_STORE = Symbol.for('dax.platform-core.object-store');
export const DOWNLOAD_URL_SECONDS = 60;

export interface UploadInput {
  entityKey: string;
  entityId: string;
  kind: string;
  fileName: string;
  buffer: Buffer;
}

export interface AttachmentSummary {
  id: string;
  entityKey: string;
  entityId: string;
  kind: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface DownloadUrl {
  url: string;
  expiresIn: number;
}

const SUMMARY_SELECT = {
  id: true,
  entityKey: true,
  entityId: true,
  kind: true,
  fileName: true,
  contentType: true,
  size: true,
  createdAt: true,
} as const;

function toSummary(
  row: Omit<AttachmentSummary, 'createdAt'> & { createdAt: Date },
): AttachmentSummary {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function storageKey(moduleKey: string, entityKey: string, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${moduleKey}/${entityKey}/${yyyy}/${mm}/${randomUUID()}`;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger('Files');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: AttachmentAccessRegistry,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore | null,
  ) {
    if (!store)
      this.logger.warn(
        'File storage is not configured; uploads and downloads are off',
      );
  }

  private requireStore(): ObjectStore {
    if (this.store) return this.store;
    throw new ServiceUnavailableException({
      code: 'FILES_UNAVAILABLE',
      message: 'File storage is not available right now.',
    });
  }

  private async assertCanAttach(
    access: AttachmentAccess,
    policy: Policy,
    entityId: string,
  ): Promise<void> {
    if (await access.canAttach(policy, entityId)) return;
    if (!(await access.canView(policy, entityId))) attachmentNotFound();
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED',
      message: "You don't have access to this.",
    });
  }

  async upload(
    input: UploadInput,
    policy: Policy,
    actor: { id: string },
  ): Promise<AttachmentSummary> {
    const store = this.requireStore();
    const access = this.registry.resolve(input.entityKey);
    await this.assertCanAttach(access, policy, input.entityId);

    if (input.buffer.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'The file is empty.',
      });
    }
    if (input.buffer.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: 'Files can be up to 15 MB.',
      });
    }
    const contentType = sniffContentType(input.buffer);
    if (!contentType) {
      throw new UnsupportedMediaTypeException({
        code: 'FILE_TYPE_NOT_ALLOWED',
        message: 'Upload a JPEG, PNG, WebP or PDF file.',
      });
    }

    const key = storageKey(access.moduleKey, input.entityKey, new Date());
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');
    const fileName = sanitizeFileName(input.fileName, contentType);
    await store.put({ key, body: input.buffer, contentType });

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.attachment.create({
          data: {
            moduleKey: access.moduleKey,
            entityKey: input.entityKey,
            entityId: input.entityId,
            kind: input.kind,
            fileName,
            contentType,
            size: input.buffer.length,
            sha256,
            storageKey: key,
            uploadedBy: actor.id,
          },
          select: SUMMARY_SELECT,
        });
        await this.audit.record(
          {
            moduleKey: access.moduleKey,
            entityKey: input.entityKey,
            entityId: input.entityId,
            action: 'attachment.upload',
            after: {
              attachmentId: created.id,
              kind: input.kind,
              contentType,
              size: input.buffer.length,
              sha256,
            },
          },
          tx,
        );
        return created;
      });
      return toSummary(row);
    } catch (error) {
      await store.delete(key).catch((cleanup: unknown) => {
        this.logger.error(
          {
            storageKey: key,
            err: cleanup instanceof Error ? cleanup.name : 'unknown',
          },
          'Could not remove an orphaned upload',
        );
      });
      throw error;
    }
  }

  private async findLive(id: string) {
    const row = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
      select: { ...SUMMARY_SELECT, moduleKey: true, storageKey: true },
    });
    return row ?? attachmentNotFound();
  }

  async downloadUrl(id: string, policy: Policy): Promise<DownloadUrl> {
    const store = this.requireStore();
    const row = await this.findLive(id);
    const access = this.registry.resolve(row.entityKey);
    if (!(await access.canView(policy, row.entityId))) attachmentNotFound();

    await this.audit.record({
      moduleKey: row.moduleKey,
      entityKey: row.entityKey,
      entityId: row.entityId,
      action: 'attachment.download',
      after: { attachmentId: row.id, kind: row.kind },
    });
    const url = await store.presignGet(
      row.storageKey,
      row.fileName,
      DOWNLOAD_URL_SECONDS,
    );
    return { url, expiresIn: DOWNLOAD_URL_SECONDS };
  }

  async list(
    entityKey: string,
    entityId: string,
    policy: Policy,
  ): Promise<AttachmentSummary[]> {
    const access = this.registry.resolve(entityKey);
    if (!(await access.canView(policy, entityId))) attachmentNotFound();
    const rows = await this.prisma.attachment.findMany({
      where: { entityKey, entityId, deletedAt: null },
      select: SUMMARY_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toSummary);
  }

  async remove(id: string, policy: Policy): Promise<void> {
    const row = await this.findLive(id);
    const access = this.registry.resolve(row.entityKey);
    await this.assertCanAttach(access, policy, row.entityId);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.attachment.updateMany({
        where: { id: row.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) attachmentNotFound();
      await this.audit.record(
        {
          moduleKey: row.moduleKey,
          entityKey: row.entityKey,
          entityId: row.entityId,
          action: 'attachment.remove',
          before: { attachmentId: row.id, kind: row.kind },
        },
        tx,
      );
    });
  }
}
