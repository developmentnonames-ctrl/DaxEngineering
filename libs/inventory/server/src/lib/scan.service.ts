import { Injectable } from '@nestjs/common';
import { normalizePartNo, type ScanResult } from '@dax/inventory-contract';
import { can, type Policy } from '@dax/platform-core';
import { PrismaService } from '@dax/platform-db';
import { MainStore } from './main-store.service';
import { looksLikeBinCode, parseScanCode, type QrKind } from './scan-code';

const NONE: ScanResult = { type: 'none' };
const MAX_CHOICES = 20;

export const itemPath = (id: string) => `/inventory/items/${id}`;
export const binPath = (id: string) => `/inventory/locations/bins/${id}`;

@Injectable()
export class ScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: MainStore,
  ) {}

  async resolve(policy: Policy, raw: string): Promise<ScanResult> {
    const code = parseScanCode(raw);
    if (code.kind === 'empty') return NONE;
    if (code.kind === 'qr') return this.byToken(policy, code.type, code.token);

    const value = code.value;
    if (code.maybeToken) {
      const hit = await this.findToken(value);
      if (hit) return this.allowed(policy, hit.type, hit.id);
    }
    const barcode = await this.prisma.itemBarcode.findUnique({
      where: { code: value },
      select: { itemId: true },
    });
    if (barcode) return this.allowed(policy, 'item', barcode.itemId);

    if (looksLikeBinCode(value)) {
      const bin = await this.prisma.bin.findFirst({
        where: { storeId: await this.store.id(), code: value.toUpperCase() },
        select: { id: true },
      });
      if (bin) return this.allowed(policy, 'bin', bin.id);
    }
    return this.byPartNo(policy, value);
  }

  async byToken(
    policy: Policy,
    type: QrKind,
    token: string,
  ): Promise<ScanResult> {
    const row =
      type === 'item'
        ? await this.prisma.item.findUnique({
            where: { qrToken: token },
            select: { id: true },
          })
        : await this.prisma.bin.findUnique({
            where: { qrToken: token },
            select: { id: true },
          });
    return row ? this.allowed(policy, type, row.id) : NONE;
  }

  private async findToken(
    token: string,
  ): Promise<{ type: QrKind; id: string } | null> {
    const item = await this.prisma.item.findUnique({
      where: { qrToken: token },
      select: { id: true },
    });
    if (item) return { type: 'item', id: item.id };
    const bin = await this.prisma.bin.findUnique({
      where: { qrToken: token },
      select: { id: true },
    });
    return bin ? { type: 'bin', id: bin.id } : null;
  }

  private async byPartNo(policy: Policy, value: string): Promise<ScanResult> {
    const norm = normalizePartNo(value);
    if (!norm || !can(policy, 'inventory.item.view')) return NONE;
    const items = await this.prisma.item.findMany({
      where: { partNoNorm: norm },
      select: {
        id: true,
        partNo: true,
        description: true,
        brand: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { partNo: 'asc' }],
      take: MAX_CHOICES,
    });
    const [only] = items;
    if (!only) return NONE;
    if (items.length === 1)
      return { type: 'item', id: only.id, path: itemPath(only.id) };
    return {
      type: 'choices',
      items: items.map((i) => ({
        id: i.id,
        partNo: i.partNo,
        brand: i.brand.name,
        description: i.description,
        path: itemPath(i.id),
      })),
    };
  }

  private allowed(policy: Policy, type: QrKind, id: string): ScanResult {
    if (type === 'item') {
      return can(policy, 'inventory.item.view')
        ? { type, id, path: itemPath(id) }
        : NONE;
    }
    return can(policy, 'inventory.location.view')
      ? { type, id, path: binPath(id) }
      : NONE;
  }
}
