// Sample documents in different stages, for every stores screen.
// Called by seed-stores.ts after the opening stock is posted.
//
// Order matters: receiving first (it adds free stock), then issuing, returns
// and warranty, and the cycle count last, because a count freezes its bins.
/* eslint-disable @nx/enforce-module-boundaries -- the library doesn't export
   these services, and this dev-only seed is the one place outside it that
   drives every document flow directly. */
import { randomUUID } from 'node:crypto';
import {
  AttachmentAccessRegistry,
  AuditService,
  type EntityDef,
  EventBus,
  NumberingService,
  type Policy,
  type RequestContext,
} from '@dax/platform-core';
import type { PrismaService } from '@dax/platform-db';
import type { MainStore, StockPostingService } from '@dax/inventory-server';
import { CountsService } from '../../../libs/inventory/server/src/lib/counts/counts.service';
import { AodsService } from '../../../libs/inventory/server/src/lib/issuing/aods.service';
import { HoldsService } from '../../../libs/inventory/server/src/lib/issuing/holds.service';
import { MrnsService } from '../../../libs/inventory/server/src/lib/issuing/mrns.service';
import { GrnsService } from '../../../libs/inventory/server/src/lib/receiving/grns.service';
import { PutawayService } from '../../../libs/inventory/server/src/lib/receiving/putaway.service';
import { ReturnsService } from '../../../libs/inventory/server/src/lib/returns/returns.service';
import { WarrantyService } from '../../../libs/inventory/server/src/lib/warranty/warranty.service';
/* eslint-enable @nx/enforce-module-boundaries */

export interface DocumentDeps {
  prisma: PrismaService;
  keeper: Policy;
  keeperCtx: RequestContext;
  entities: EntityDef[];
  store: MainStore;
  engine: StockPostingService;
}

/** What each stage looks like, for the summary printed at the end. */
export type DocumentSummary = string[];

export async function seedDocuments(
  deps: DocumentDeps,
): Promise<DocumentSummary> {
  const { prisma, keeper, store, engine } = deps;
  const audit = new AuditService(prisma, deps.keeperCtx, deps.entities);
  const numbering = new NumberingService();
  const events = new EventBus();
  const attachments = new AttachmentAccessRegistry();
  const holds = new HoldsService(prisma, audit, numbering, engine);
  const mrns = new MrnsService(prisma, audit, numbering, engine, store, []);
  const aods = new AodsService(
    prisma,
    audit,
    numbering,
    events,
    engine,
    store,
    mrns,
    attachments,
  );
  const grns = new GrnsService(prisma, audit, numbering, events, engine, store);
  const putaway = new PutawayService(prisma, audit, events, engine, store);
  const warranty = new WarrantyService(
    prisma,
    audit,
    numbering,
    store,
    attachments,
  );
  const returns = new ReturnsService(
    prisma,
    audit,
    numbering,
    engine,
    store,
    warranty,
  );
  const counts = new CountsService(prisma, audit, numbering, engine, store);

  // Look-ups by the names used in stores-seed-data.ts.
  const [itemRows, binRows, customerRows, supplierRows, modelRows] =
    await Promise.all([
      prisma.item.findMany({
        where: { createdBy: keeper.userId },
        select: { id: true, partNo: true, defaultBinId: true },
      }),
      prisma.bin.findMany({ select: { id: true, code: true } }),
      prisma.customer.findMany({
        where: { createdBy: keeper.userId },
        select: { id: true, name: true },
      }),
      prisma.supplier.findMany({
        where: { createdBy: keeper.userId },
        select: { id: true, name: true },
      }),
      prisma.machineModel.findMany({ select: { id: true, name: true } }),
    ]);
  const lookup = <T extends { id: string }>(
    rows: T[],
    key: (r: T) => string,
    what: string,
  ) => {
    const map = new Map(rows.map((r) => [key(r), r]));
    return (name: string): T => {
      const row = map.get(name);
      if (!row)
        throw new Error(`Seed documents name an unknown ${what}: ${name}`);
      return row;
    };
  };
  const item = lookup(itemRows, (r) => r.partNo, 'item');
  const itemId = (partNo: string) => item(partNo).id;
  const homeBin = (partNo: string) => {
    const id = item(partNo).defaultBinId;
    if (!id) throw new Error(`${partNo} has no default bin`);
    return id;
  };
  const binId = (code: string) =>
    lookup(binRows, (r) => r.code, 'bin')(code).id;
  const customerId = (name: string) =>
    lookup(customerRows, (r) => r.name, 'customer')(name).id;
  const supplierId = (name: string) =>
    lookup(supplierRows, (r) => r.name, 'supplier')(name).id;
  const modelId = (name: string) =>
    lookup(modelRows, (r) => r.name, 'machine model')(name).id;

  // Holds, requests and free returns need an active department.
  const department = await prisma.department.findFirst({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  if (!department)
    throw new Error(
      'There is no active department. Turn one on in the admin app first.',
    );
  const departmentId = department.id;
  const today = new Date().toISOString().slice(0, 10);
  const summary: DocumentSummary = [
    `Documents use the ${department.name} department.`,
  ];
  const line = (itemPart: string, qty: string) => ({
    itemId: itemId(itemPart),
    qty,
  });
  const grnLine = (
    itemPart: string,
    expected: string | null,
    good: string,
    damaged = '0',
  ) => ({
    itemId: itemId(itemPart),
    qtyExpected: expected,
    qtyGood: good,
    qtyDamaged: damaged,
    wrongItem: false,
  });

  // ---------------------------------------------------------------- Receiving
  console.log('Receiving: GRNs and put-away');
  // 1. Received and fully put away.
  let grn = await grns.create(keeper, {
    supplierId: supplierId('Colombo Engine Spares'),
    deliveryNote: 'CES/DN/4471',
    deliveryDate: today,
  });
  grn = await grns.update(keeper, grn.id, {
    version: grn.version,
    lines: [grnLine('1R-1808', '20', '20'), grnLine('ELC-50', '100', '100')],
  });
  grn = await grns.check(keeper, grn.id, grn.version);
  grn = await grns.post(keeper, grn.id, grn.version);
  await putaway.putAway(keeper, {
    moves: grn.lines.map((l) => ({
      grnLineId: l.id,
      binId: homeBin(l.item.partNo),
      qty: l.item.partNo === 'ELC-50' ? '100' : '20',
    })),
  });
  summary.push(`GRN ${grn.number}: received and put away`);

  // 2. Posted, still in the receiving bin; one short and one damaged, so it
  //    also opens two discrepancies.
  grn = await grns.create(keeper, {
    supplierId: supplierId('Gulf Heavy Parts FZE'),
    deliveryNote: 'GHP-INV-20931',
    deliveryDate: today,
  });
  grn = await grns.update(keeper, grn.id, {
    version: grn.version,
    lines: [grnLine('21141858', '8', '6', '1'), grnLine('20734269', '2', '2')],
  });
  grn = await grns.check(keeper, grn.id, grn.version);
  grn = await grns.post(keeper, grn.id, grn.version);
  summary.push(
    `GRN ${grn.number}: waiting for put-away, with a short and a damaged discrepancy`,
  );

  // 3. Checked, not posted yet.
  grn = await grns.create(keeper, {
    supplierId: supplierId('Lanka Filter House'),
    deliveryNote: 'LFH 7712',
    deliveryDate: today,
  });
  grn = await grns.update(keeper, grn.id, {
    version: grn.version,
    lines: [grnLine('26560201', '12', '12'), grnLine('FS1000', '10', '10')],
  });
  grn = await grns.check(keeper, grn.id, grn.version);
  summary.push('GRN (checked): ready to post');

  // 4. Draft, still being counted at the dock.
  grn = await grns.create(keeper, {
    supplierId: supplierId('Kandy Bearing Centre'),
    deliveryNote: 'KBC-0388',
    deliveryDate: today,
  });
  // The seals line isn't counted yet, so it still reads 0.
  await grns.update(keeper, grn.id, {
    version: grn.version,
    lines: [grnLine('6205-2RS', '24', '24'), grnLine('CR 40X62X7', '20', '0')],
  });
  summary.push('GRN (draft): being counted');

  // ------------------------------------------------------------------ Issuing
  console.log('Issuing: holds, requests and AODs');
  const hold = await holds.create(keeper, {
    departmentId,
    customerId: customerId('Ceylon Power Rentals'),
    reason: 'Kept for the quarterly generator service.',
    lines: [line('HF6177', '2'), line('WF2076', '4')],
  });
  summary.push(`Hold ${hold.number}: active`);

  const toConvert = await holds.create(keeper, {
    departmentId,
    customerId: customerId('Lankaputra Constructions (Pvt) Ltd'),
    reason: 'Bucket teeth promised to the site.',
    lines: [line('4I-7404', '6')],
  });
  const converted = await mrns.convertHold(keeper, toConvert.id, {
    version: toConvert.version,
    subtype: 'SAL',
    jobNumber: 'JOB-2611-014',
  });
  summary.push(
    `Hold ${toConvert.number}: converted to ${converted.number} (ready to pick)`,
  );

  const newMrn = (
    subtype: 'PRT' | 'SRV' | 'SAL',
    customer: string | null,
    job: string,
    lines: [string, string][],
  ) =>
    mrns.create(keeper, {
      subtype,
      departmentId,
      customerId: customer ? customerId(customer) : null,
      jobNumber: job,
      lines: lines.map(([part, qty]) => ({ itemId: itemId(part), qty })),
    });
  const submitAndCheck = async (mrn: Awaited<ReturnType<typeof newMrn>>) => {
    const submitted = await mrns.submit(keeper, mrn.id, mrn.version);
    return mrns.check(keeper, submitted.id, submitted.version);
  };

  // Draft, not sent yet.
  await newMrn('PRT', null, 'JOB-2611-021', [['G4MXT-1/2', '12']]);
  summary.push('MRN (draft): not submitted');

  // Submitted, waiting to be checked.
  let mrn = await newMrn('SRV', 'Southern Quarry Works', 'JOB-2611-022', [
    ['26560201', '3'],
  ]);
  mrn = await mrns.submit(keeper, mrn.id, mrn.version);
  summary.push(`MRN ${mrn.number}: to check`);

  // Checked, partly waiting for stock (one part has none).
  mrn = await submitAndCheck(
    await newMrn('SRV', 'Harbour Logistics Lanka', 'JOB-2611-023', [
      ['6754-11-1811', '2'],
      ['600-211-1340', '2'],
    ]),
  );
  summary.push(`MRN ${mrn.number}: waiting for stock`);

  // Checked and fully reserved: ready to pick.
  mrn = await submitAndCheck(
    await newMrn('PRT', 'Western Aggregates', 'JOB-2611-024', [
      ['LF9009', '4'],
      ['FF5052', '4'],
    ]),
  );
  summary.push(`MRN ${mrn.number}: ready to pick`);

  // Picking in progress.
  mrn = await submitAndCheck(
    await newMrn('SRV', 'Sigiri Hotels (Pvt) Ltd', 'JOB-2611-025', [
      ['2645A747', '2'],
      ['8PK1795', '1'],
    ]),
  );
  await aods.create(keeper, {
    mrnId: mrn.id,
    type: 'SER',
    deliverTo: 'Sigiri Hotels, plant room',
    vehicleNo: 'WP LK-4471',
  });
  summary.push(`MRN ${mrn.number}: AOD being picked`);

  // Issued, waiting for the signed copy.
  mrn = await submitAndCheck(
    await newMrn('SRV', 'Ruhuna Hospital Services', 'JOB-2611-026', [
      ['1R-0750', '6'],
      ['15W40-CK4', '40'],
    ]),
  );
  let aod = await aods.create(keeper, {
    mrnId: mrn.id,
    type: 'REP',
    deliverTo: 'Ruhuna Hospital, generator house',
    vehicleNo: 'SP KD-2290',
  });
  aod = await aods.issue(keeper, aod.id, aod.version);
  summary.push(`AOD ${aod.number}: issued, awaiting signature`);

  // Issued and signed, so the request closes. Its parts come back below.
  mrn = await submitAndCheck(
    await newMrn('SRV', 'Hill Country Estates Ltd', 'JOB-2611-027', [
      ['6205-2RS', '10'],
      ['2654407', '6'],
      ['4914505', '3'],
    ]),
  );
  let signed = await aods.create(keeper, {
    mrnId: mrn.id,
    type: 'SER',
    deliverTo: 'Hill Country Estates, factory',
    vehicleNo: 'CP HA-8812',
  });
  signed = await aods.issue(keeper, signed.id, signed.version);
  // Only the file record is seeded; there is no real scanned copy to download.
  const file = await prisma.attachment.create({
    data: {
      moduleKey: 'inventory',
      entityKey: 'inventory.aod',
      entityId: signed.id,
      kind: 'signed_aod',
      fileName: `${signed.number?.replaceAll('/', '-')}-signed.pdf`,
      contentType: 'application/pdf',
      size: 1024,
      sha256: '0'.repeat(64),
      storageKey: `seed/${randomUUID()}`,
      uploadedBy: keeper.userId,
    },
    select: { id: true },
  });
  signed = await aods.sign(keeper, signed.id, {
    version: signed.version,
    attachmentId: file.id,
  });
  summary.push(`AOD ${signed.number}: signed (request closed)`);

  // ------------------------------------------------------- Returns, warranty
  console.log('Returns and warranty');
  const lineOf = (part: string) => {
    const l = signed.lines.find((x) => x.item.partNo === part);
    if (!l) throw new Error(`AOD ${signed.number} has no ${part}`);
    return l.id;
  };
  let ret = await returns.create(keeper, {
    aodId: signed.id,
    reason: 'Left over after the service job.',
    lines: [
      {
        aodLineId: lineOf('6205-2RS'),
        itemId: itemId('6205-2RS'),
        qty: '2',
        condition: 'GOOD',
        binId: homeBin('6205-2RS'),
      },
      {
        aodLineId: lineOf('2654407'),
        itemId: itemId('2654407'),
        qty: '1',
        condition: 'DAMAGED',
        notes: 'Housing dented in transit.',
      },
      {
        aodLineId: lineOf('4914505'),
        itemId: itemId('4914505'),
        qty: '1',
        condition: 'FAULTY',
        serialNo: 'TS-49145-0071',
        notes: 'Sticks open; engine runs cold.',
      },
    ],
  });
  ret = await returns.post(keeper, ret.id, ret.version);
  summary.push(
    `Return ${ret.number}: posted (good, damaged, and a faulty part tagged for warranty)`,
  );

  await returns.create(keeper, {
    departmentId,
    customerId: customerId('Northern Roads Consortium'),
    jobNumber: 'JOB-2611-030',
    reason: 'Customer returned unused hose after the job.',
    lines: [
      {
        itemId: itemId('G4MXT-1/2'),
        qty: '5',
        condition: 'GOOD',
        binId: homeBin('G4MXT-1/2'),
      },
    ],
  });
  summary.push('Return (draft): free return, not posted');

  let tag = await warranty.create(keeper, {
    itemId: itemId('10R-7225'),
    qty: '1',
    serialNo: 'INJ-10R7225-4410',
    machineModelId: modelId('CAT C9 engine'),
    machineSerial: 'C9-BKL-02291',
    jobNumber: 'JOB-2611-011',
    customerId: customerId('Lankaputra Constructions (Pvt) Ltd'),
    fault: 'Injector leaks back; misfire on cylinder 4 after 300 hours.',
    supplierId: null,
  });
  tag = await warranty.send(keeper, tag.id, {
    version: tag.version,
    supplierId: supplierId('Colombo Engine Spares'),
    claimNumber: 'CES-WC-1182',
  });
  summary.push(`Warranty ${tag.number}: sent to supplier`);

  tag = await warranty.create(keeper, {
    itemId: itemId('3286278'),
    qty: '1',
    serialNo: 'WP-3286-77120',
    machineModelId: modelId('Cummins 6BT5.9 engine'),
    customerId: customerId('Western Aggregates'),
    fault: 'Seal weeps coolant within the first week.',
    supplierId: supplierId('Singapore Power Spares Pte Ltd'),
  });
  tag = await warranty.send(keeper, tag.id, {
    version: tag.version,
    supplierId: supplierId('Singapore Power Spares Pte Ltd'),
    claimNumber: 'SPS-88412',
  });
  tag = await warranty.close(keeper, tag.id, {
    version: tag.version,
    outcome: 'REPLACED',
    note: 'Supplier sent a new pump.',
  });
  summary.push(`Warranty ${tag.number}: closed, replaced`);

  // ------------------------------------------------------------- Cycle count
  // Last, on bins nothing above touches. Counted and submitted by the seed;
  // you approve it, since the approver must be someone else.
  console.log('Cycle count');
  let count = await counts.create(keeper, {
    kind: 'CYCLE',
    blind: false,
    notes: 'Monthly check of the hydraulics shelf.',
    zoneIds: [],
    binIds: ['HYD-01-02-A', 'HYD-02-01-A', 'HYD-02-01-B'].map(binId),
  });
  const counted: Record<string, string> = {
    'LGEP 2/1': '17.5',
    '20U-62-71212': '3',
    '707-99-46600': '1',
  };
  count = await counts.enter(keeper, count.id, {
    version: count.version,
    lines: count.bins.flatMap((b) =>
      b.lines.map((l) => ({
        lineId: l.id,
        countedQty: counted[l.item.partNo] ?? '0',
      })),
    ),
  });
  count = await counts.submit(keeper, count.id, count.version);
  summary.push(
    `Count ${count.number}: submitted, waiting for approval (grease is 1 kg short)`,
  );

  return summary;
}
