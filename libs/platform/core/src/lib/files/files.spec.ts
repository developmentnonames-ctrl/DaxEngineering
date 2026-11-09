import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { PrismaService } from '@dax/platform-db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Policy } from '../acm/policy';
import type { AuditService } from '../audit/audit.service';
import type { DaxRequest } from '../auth/internal-caller';
import {
  type AttachmentAccess,
  AttachmentAccessRegistry,
} from './access-registry';
import { AttachmentsController } from './attachments.controller';
import {
  contentDisposition,
  MAX_UPLOAD_BYTES,
  sanitizeFileName,
  sniffContentType,
} from './content-type';
import { FilesService } from './files.service';
import { InMemoryObjectStore } from './object-store';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1');
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1');
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const ENTITY = 'inventory.grn';
const VISIBLE = randomUUID();
const HIDDEN = randomUUID();
const READ_ONLY = randomUUID();
const policy = { userId: randomUUID() } as Policy;
const actor = { id: policy.userId };

type Row = Record<string, unknown> & { id: string; deletedAt: Date | null };

function pick(row: Row, select: Record<string, boolean> | undefined) {
  if (!select) return row;
  return Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));
}

function fakePrisma() {
  const rows = new Map<string, Row>();
  const state = { failCreate: false };
  const attachment = {
    create: vi.fn(
      async (args: {
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        if (state.failCreate) throw new Error('database unavailable');
        const row: Row = {
          ...args.data,
          id: randomUUID(),
          createdAt: new Date(),
          deletedAt: null,
        };
        rows.set(row.id, row);
        return pick(row, args.select);
      },
    ),
    findFirst: vi.fn(
      async (args: {
        where: { id: string };
        select?: Record<string, boolean>;
      }) => {
        const row = rows.get(args.where.id);
        return row && !row.deletedAt ? pick(row, args.select) : null;
      },
    ),
    findMany: vi.fn(
      async (args: {
        where: { entityKey: string; entityId: string };
        select?: Record<string, boolean>;
      }) =>
        [...rows.values()]
          .filter(
            (r) =>
              r['entityKey'] === args.where.entityKey &&
              r['entityId'] === args.where.entityId &&
              !r.deletedAt,
          )
          .map((r) => pick(r, args.select)),
    ),
    updateMany: vi.fn(
      async (args: { where: { id: string }; data: { deletedAt: Date } }) => {
        const row = rows.get(args.where.id);
        if (!row || row.deletedAt) return { count: 0 };
        row.deletedAt = args.data.deletedAt;
        return { count: 1 };
      },
    ),
  };
  const client = {
    attachment,
    $transaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>) =>
      fn(client),
    ),
  };
  return { client, rows, state };
}

function setup(options: { store?: InMemoryObjectStore | null } = {}) {
  const prisma = fakePrisma();
  const audit = { record: vi.fn(async () => undefined) };
  const registry = new AttachmentAccessRegistry();
  const access: AttachmentAccess = {
    moduleKey: 'inventory',
    canView: vi.fn(
      async (_p: Policy, id: string) => id === VISIBLE || id === READ_ONLY,
    ),
    canAttach: vi.fn(async (_p: Policy, id: string) => id === VISIBLE),
  };
  registry.register(ENTITY, access);
  const store =
    options.store === undefined ? new InMemoryObjectStore() : options.store;
  const service = new FilesService(
    prisma.client as unknown as PrismaService,
    audit as unknown as AuditService,
    registry,
    store,
  );
  return { service, prisma, audit, store, registry, access };
}

function upload(
  buffer: Buffer,
  entityId = VISIBLE,
  fileName = 'delivery note.png',
) {
  return { entityKey: ENTITY, entityId, kind: 'photo', fileName, buffer };
}

describe('sniffContentType', () => {
  it('recognises the four allowed formats by their bytes', () => {
    expect(sniffContentType(JPEG)).toBe('image/jpeg');
    expect(sniffContentType(PNG)).toBe('image/png');
    expect(sniffContentType(WEBP)).toBe('image/webp');
    expect(sniffContentType(PDF)).toBe('application/pdf');
  });

  it('rejects executables, markup and truncated headers', () => {
    expect(sniffContentType(EXE)).toBeNull();
    expect(sniffContentType(HTML)).toBeNull();
    expect(sniffContentType(SVG)).toBeNull();
    expect(
      sniffContentType(Buffer.from('RIFF\x10\x00\x00\x00WAVE', 'latin1')),
    ).toBeNull();
    expect(sniffContentType(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniffContentType(Buffer.alloc(0))).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('drops paths and control characters', () => {
    expect(sanitizeFileName('C:\\Users\\x\\scan.pdf', 'application/pdf')).toBe(
      'scan.pdf',
    );
    expect(sanitizeFileName('../../etc/a\u0000b\u202e.png', 'image/png')).toBe(
      'ab.png',
    );
    expect(sanitizeFileName('  ..  ', 'image/png')).toBe('file.png');
  });

  it('makes the extension match the real content', () => {
    expect(sanitizeFileName('invoice.exe', 'image/png')).toBe('invoice.png');
    expect(sanitizeFileName('page.html', 'application/pdf')).toBe('page.pdf');
    expect(sanitizeFileName('photo.JPEG', 'image/jpeg')).toBe('photo.jpeg');
    expect(sanitizeFileName('Invoice No. 5', 'application/pdf')).toBe(
      'Invoice No. 5.pdf',
    );
  });

  it('caps the length at 120 characters', () => {
    const name = sanitizeFileName(`${'é'.repeat(300)}.pdf`, 'application/pdf');
    expect(Array.from(name)).toHaveLength(120);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  it('builds an attachment disposition safe for any name', () => {
    expect(contentDisposition('ලිපිය "1".pdf')).toBe(
      `attachment; filename="_____ _1_.pdf"; filename*=UTF-8''%E0%B6%BD%E0%B7%92%E0%B6%B4%E0%B7%92%E0%B6%BA%20%221%22.pdf`,
    );
  });
});

describe('FilesService.upload', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('stores the object under a key with no user data, then records and audits it', async () => {
    const result = await ctx.service.upload(
      upload(PNG, VISIBLE, 'Kasun/../secret.exe'),
      policy,
      actor,
    );

    expect(result).toMatchObject({
      entityKey: ENTITY,
      entityId: VISIBLE,
      kind: 'photo',
      fileName: 'secret.png',
      contentType: 'image/png',
      size: PNG.length,
    });
    expect(Object.keys(result)).not.toContain('storageKey');
    const [key] = [...(ctx.store?.objects.keys() ?? [])];
    expect(key).toMatch(
      /^inventory\/inventory\.grn\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/,
    );
    const row = ctx.prisma.rows.get(result.id);
    expect(row?.['sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.['uploadedBy']).toBe(actor.id);
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKey: 'inventory',
        entityKey: ENTITY,
        entityId: VISIBLE,
        action: 'attachment.upload',
      }),
      ctx.prisma.client,
    );
  });

  it('rejects a renamed executable or HTML page whatever its name says', async () => {
    for (const [buffer, name] of [
      [EXE, 'photo.jpg'],
      [HTML, 'scan.pdf'],
      [SVG, 'logo.png'],
    ] as const) {
      await expect(
        ctx.service.upload(upload(buffer, VISIBLE, name), policy, actor),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    }
    expect(ctx.store?.objects.size).toBe(0);
    expect(ctx.audit.record).not.toHaveBeenCalled();
  });

  it('enforces the size limit', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_UPLOAD_BYTES)]);
    await expect(
      ctx.service.upload(upload(big), policy, actor),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    const empty = ctx.service.upload(upload(Buffer.alloc(0)), policy, actor);
    await expect(empty).rejects.toMatchObject({ status: 400 });
  });

  it('answers 404 outside scope and 403 when the record is visible but read-only', async () => {
    await expect(
      ctx.service.upload(upload(PNG, HIDDEN), policy, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctx.service.upload(upload(PNG, READ_ONLY), policy, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      ctx.service.upload(
        { ...upload(PNG), entityKey: 'inventory.unknown' },
        policy,
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.store?.objects.size).toBe(0);
  });

  it('removes the stored object when the database insert fails', async () => {
    ctx.prisma.state.failCreate = true;
    await expect(
      ctx.service.upload(upload(PNG), policy, actor),
    ).rejects.toThrow('database unavailable');
    expect(ctx.store?.objects.size).toBe(0);
    expect(ctx.audit.record).not.toHaveBeenCalled();
  });

  it('fails with 503 when storage is not configured', async () => {
    const { service } = setup({ store: null });
    await expect(
      service.upload(upload(PNG), policy, actor),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('FilesService download, list and remove', () => {
  let ctx: ReturnType<typeof setup>;
  let visibleId: string;
  let hiddenId: string;

  beforeEach(async () => {
    ctx = setup();
    visibleId = (await ctx.service.upload(upload(PDF), policy, actor)).id;
    const hidden = await ctx.service.upload(upload(JPEG), policy, actor);
    hiddenId = hidden.id;
    const row = ctx.prisma.rows.get(hiddenId);
    if (row) row['entityId'] = HIDDEN;
    ctx.audit.record.mockClear();
  });

  it('audits, then returns a 60-second attachment URL', async () => {
    const result = await ctx.service.downloadUrl(visibleId, policy);
    expect(result.expiresIn).toBe(60);
    expect(result.url).toContain('response-content-disposition=attachment');
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attachment.download',
        entityId: VISIBLE,
      }),
    );
  });

  it('answers 404 for out-of-scope, deleted and unknown files without auditing', async () => {
    for (const id of [hiddenId, randomUUID()]) {
      await expect(ctx.service.downloadUrl(id, policy)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
    await ctx.service.remove(visibleId, policy);
    ctx.audit.record.mockClear();
    await expect(
      ctx.service.downloadUrl(visibleId, policy),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.audit.record).not.toHaveBeenCalled();
  });

  it('lists only live files on a visible record', async () => {
    expect(
      (await ctx.service.list(ENTITY, VISIBLE, policy)).map((a) => a.id),
    ).toEqual([visibleId]);
    await expect(
      ctx.service.list(ENTITY, HIDDEN, policy),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('soft-deletes with an audit row and needs attach rights', async () => {
    await ctx.service.remove(visibleId, policy);
    expect(ctx.prisma.rows.get(visibleId)?.deletedAt).toBeInstanceOf(Date);
    expect(ctx.store?.objects.size).toBe(2);
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attachment.remove' }),
      ctx.prisma.client,
    );
    await expect(ctx.service.remove(hiddenId, policy)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AttachmentAccessRegistry', () => {
  it('refuses duplicates and keys outside the module', () => {
    const registry = new AttachmentAccessRegistry();
    const access = {
      moduleKey: 'inventory',
      canView: vi.fn(),
      canAttach: vi.fn(),
    };
    registry.register(ENTITY, access);
    expect(() => registry.register(ENTITY, access)).toThrow(
      /already registered/,
    );
    expect(() => registry.register('sales.order', access)).toThrow(
      /module key/,
    );
  });
});

describe('AttachmentsController', () => {
  const req = {
    auth: { sessionId: 's', user: { id: actor.id } },
    daxApp: 'web',
    policy,
  } as unknown as DaxRequest;

  it('validates fields before calling the service', async () => {
    const files = { upload: vi.fn(), list: vi.fn() };
    const controller = new AttachmentsController(
      files as unknown as FilesService,
    );
    const file = { buffer: PNG, originalname: 'a.png' };

    expect(() =>
      controller.upload(
        req,
        { entityKey: 'Bad Key', entityId: VISIBLE, kind: 'photo' },
        file,
      ),
    ).toThrow(HttpException);
    expect(() =>
      controller.upload(
        req,
        { entityKey: ENTITY, entityId: VISIBLE, kind: 'photo' },
        undefined,
      ),
    ).toThrow(HttpException);
    expect(() =>
      controller.list(req, { entityKey: ENTITY, entityId: 'nope' }),
    ).toThrow(HttpException);
    expect(files.upload).not.toHaveBeenCalled();

    controller.upload(
      req,
      { entityKey: ENTITY, entityId: VISIBLE, kind: 'photo' },
      file,
    );
    expect(files.upload).toHaveBeenCalledWith(
      {
        entityKey: ENTITY,
        entityId: VISIBLE,
        kind: 'photo',
        fileName: 'a.png',
        buffer: PNG,
      },
      policy,
      { id: actor.id },
    );
  });
});
