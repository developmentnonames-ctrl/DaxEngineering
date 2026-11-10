// Dev only. Removes exactly what seed-stores.ts added, and nothing else.
// Run: pnpm db:unseed:stores
//
// Seeded rows are the ones created by the two "Seed data" accounts, plus
// documents you started from a seeded one (an AOD picked for a seeded request,
// a return against a seeded AOD, approving the seeded count). Brands, machine
// models and zones have no "created by", so they are found through the seed's
// own audit "create" rows. If anything else you made uses the seeded items,
// bins, customers or suppliers, nothing is removed and the script lists what
// is in the way.
//
// The stock ledger and audit log are append-only. Their triggers are switched
// off inside this one transaction, as the table owner, and back on before it
// commits, so nothing outside this script can write past them.
import { PrismaService } from '@dax/platform-db';
import { assertLocalDatabase } from './seed-guard';
import { SEED_USER_IDS } from './stores-seed-data';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

class Blocked extends Error {}

const SEED_TABLES = `
  CREATE TEMP TABLE seed_item ON COMMIT DROP AS
    SELECT id FROM inventory.item WHERE created_by = ANY($1::uuid[]);
  CREATE TEMP TABLE seed_bin ON COMMIT DROP AS
    SELECT id FROM inventory.bin WHERE created_by = ANY($1::uuid[]);
  CREATE TEMP TABLE seed_customer ON COMMIT DROP AS
    SELECT id FROM parties.customer WHERE created_by = ANY($1::uuid[]);
  CREATE TEMP TABLE seed_supplier ON COMMIT DROP AS
    SELECT id FROM parties.supplier WHERE created_by = ANY($1::uuid[]);
  CREATE TEMP TABLE seed_created ON COMMIT DROP AS
    SELECT DISTINCT entity_key, entity_id::uuid AS id FROM audit.audit_log
    WHERE actor_id = ANY($1::uuid[]) AND action = 'create'
      AND entity_key IN ('inventory.brand', 'inventory.machine_model', 'inventory.zone');
  CREATE TEMP TABLE seed_count ON COMMIT DROP AS
    SELECT id FROM inventory.stock_count WHERE created_by = ANY($1::uuid[]);
  CREATE TEMP TABLE seed_grn ON COMMIT DROP AS
    SELECT id FROM inventory.grn WHERE created_by = ANY($1::uuid[]);
  CREATE TEMP TABLE seed_hold ON COMMIT DROP AS
    SELECT id FROM inventory.hold WHERE created_by = ANY($1::uuid[]);
  CREATE TEMP TABLE seed_mrn ON COMMIT DROP AS
    SELECT id FROM inventory.mrn
    WHERE created_by = ANY($1::uuid[]) OR hold_id IN (SELECT id FROM seed_hold);
  CREATE TEMP TABLE seed_aod ON COMMIT DROP AS
    SELECT id FROM inventory.aod
    WHERE created_by = ANY($1::uuid[]) OR mrn_id IN (SELECT id FROM seed_mrn);
  CREATE TEMP TABLE seed_return ON COMMIT DROP AS
    SELECT id FROM inventory.return_note
    WHERE created_by = ANY($1::uuid[]) OR aod_id IN (SELECT id FROM seed_aod);
  CREATE TEMP TABLE seed_tag ON COMMIT DROP AS
    SELECT id FROM inventory.warranty_tag WHERE created_by = ANY($1::uuid[])
    UNION
    SELECT warranty_tag_id FROM inventory.return_line
    WHERE return_id IN (SELECT id FROM seed_return) AND warranty_tag_id IS NOT NULL;
  CREATE TEMP TABLE seed_discrepancy ON COMMIT DROP AS
    SELECT id FROM inventory.discrepancy WHERE grn_id IN (SELECT id FROM seed_grn);
  CREATE TEMP TABLE seed_doc ON COMMIT DROP AS
    SELECT id FROM seed_count UNION SELECT id FROM seed_grn
    UNION SELECT id FROM seed_hold UNION SELECT id FROM seed_mrn
    UNION SELECT id FROM seed_aod UNION SELECT id FROM seed_return
    UNION SELECT id FROM seed_tag;
  CREATE TEMP TABLE seed_event ON COMMIT DROP AS
    SELECT id FROM core.outbox_event
    WHERE payload->>'grnId' IN (SELECT id::text FROM seed_grn)
       OR payload->>'aodId' IN (SELECT id::text FROM seed_aod);
`;

const ITEM_OR_BIN = `(item_id IN (SELECT id FROM seed_item) OR bin_id IN (SELECT id FROM seed_bin))`;

// Your own records that point at seeded rows. Any of these stops the reverse.
const BLOCKERS: [label: string, sql: string][] = [
  [
    'GRN lines',
    `SELECT count(*) FROM inventory.grn_line WHERE grn_id NOT IN (SELECT id FROM seed_grn) AND item_id IN (SELECT id FROM seed_item)`,
  ],
  [
    'GRNs from seeded suppliers',
    `SELECT count(*) FROM inventory.grn WHERE id NOT IN (SELECT id FROM seed_grn) AND supplier_id IN (SELECT id FROM seed_supplier)`,
  ],
  [
    'reservations',
    `SELECT count(*) FROM inventory.reservation WHERE source_id NOT IN (SELECT id FROM seed_hold UNION SELECT id FROM seed_mrn) AND item_id IN (SELECT id FROM seed_item)`,
  ],
  [
    'hold lines',
    `SELECT count(*) FROM inventory.hold_line WHERE hold_id NOT IN (SELECT id FROM seed_hold) AND item_id IN (SELECT id FROM seed_item)`,
  ],
  [
    'holds for seeded customers',
    `SELECT count(*) FROM inventory.hold WHERE id NOT IN (SELECT id FROM seed_hold) AND customer_id IN (SELECT id FROM seed_customer)`,
  ],
  [
    'MRN lines',
    `SELECT count(*) FROM inventory.mrn_line WHERE mrn_id NOT IN (SELECT id FROM seed_mrn) AND item_id IN (SELECT id FROM seed_item)`,
  ],
  [
    'MRNs for seeded customers',
    `SELECT count(*) FROM inventory.mrn WHERE id NOT IN (SELECT id FROM seed_mrn) AND customer_id IN (SELECT id FROM seed_customer)`,
  ],
  [
    'AOD lines',
    `SELECT count(*) FROM inventory.aod_line WHERE aod_id NOT IN (SELECT id FROM seed_aod) AND ${ITEM_OR_BIN}`,
  ],
  [
    'return lines',
    `SELECT count(*) FROM inventory.return_line WHERE return_id NOT IN (SELECT id FROM seed_return) AND ${ITEM_OR_BIN}`,
  ],
  [
    'returns from seeded customers',
    `SELECT count(*) FROM inventory.return_note WHERE id NOT IN (SELECT id FROM seed_return) AND customer_id IN (SELECT id FROM seed_customer)`,
  ],
  [
    'warranty tags',
    `SELECT count(*) FROM inventory.warranty_tag WHERE id NOT IN (SELECT id FROM seed_tag) AND (${ITEM_OR_BIN} OR customer_id IN (SELECT id FROM seed_customer) OR supplier_id IN (SELECT id FROM seed_supplier))`,
  ],
  [
    'lines on other stock counts',
    `SELECT count(*) FROM inventory.count_line WHERE count_id NOT IN (SELECT id FROM seed_count) AND ${ITEM_OR_BIN}`,
  ],
  [
    'other stock counts holding seeded bins',
    `SELECT count(*) FROM inventory.bin WHERE id IN (SELECT id FROM seed_bin) AND count_id IS NOT NULL AND count_id NOT IN (SELECT id FROM seed_count)`,
  ],
  [
    'other stock movements',
    `SELECT count(*) FROM inventory.stock_ledger WHERE actor_id <> ALL($1::uuid[]) AND doc_id NOT IN (SELECT id FROM seed_doc) AND ${ITEM_OR_BIN}`,
  ],
  [
    'other items using a seeded bin or part',
    `SELECT count(*) FROM inventory.item WHERE id NOT IN (SELECT id FROM seed_item) AND (default_bin_id IN (SELECT id FROM seed_bin) OR superseded_by_id IN (SELECT id FROM seed_item))`,
  ],
];

// In order: children before parents. Labels are printed in the summary.
const DELETES: [label: string, sql: string][] = [
  [
    'stock count lines',
    `DELETE FROM inventory.count_line WHERE count_id IN (SELECT id FROM seed_count)`,
  ],
  [
    '',
    `UPDATE inventory.bin SET count_id = NULL WHERE count_id IN (SELECT id FROM seed_count)`,
  ],
  [
    'stock counts',
    `DELETE FROM inventory.stock_count WHERE id IN (SELECT id FROM seed_count)`,
  ],
  [
    '',
    `ALTER TABLE inventory.stock_ledger DISABLE TRIGGER stock_ledger_append_only`,
  ],
  [
    'stock movements',
    `DELETE FROM inventory.stock_ledger WHERE actor_id = ANY($1::uuid[]) OR doc_id IN (SELECT id FROM seed_doc)`,
  ],
  [
    '',
    `ALTER TABLE inventory.stock_ledger ENABLE TRIGGER stock_ledger_append_only`,
  ],
  [
    'reservations',
    `DELETE FROM inventory.reservation WHERE source_id IN (SELECT id FROM seed_hold UNION SELECT id FROM seed_mrn)`,
  ],
  [
    'returns',
    `DELETE FROM inventory.return_note WHERE id IN (SELECT id FROM seed_return)`,
  ],
  [
    'warranty tags',
    `DELETE FROM inventory.warranty_tag WHERE id IN (SELECT id FROM seed_tag)`,
  ],
  [
    'file records',
    `DELETE FROM core.attachment WHERE uploaded_by = ANY($1::uuid[])
       OR (entity_key = 'inventory.aod' AND entity_id::text IN (SELECT id::text FROM seed_aod))
       OR (entity_key = 'inventory.warranty_tag' AND entity_id::text IN (SELECT id::text FROM seed_tag))
       OR (entity_key = 'inventory.discrepancy' AND entity_id::text IN (SELECT id::text FROM seed_discrepancy))`,
  ],
  ['AODs', `DELETE FROM inventory.aod WHERE id IN (SELECT id FROM seed_aod)`],
  ['MRNs', `DELETE FROM inventory.mrn WHERE id IN (SELECT id FROM seed_mrn)`],
  [
    'holds',
    `DELETE FROM inventory.hold WHERE id IN (SELECT id FROM seed_hold)`,
  ],
  [
    'discrepancies',
    `DELETE FROM inventory.discrepancy WHERE id IN (SELECT id FROM seed_discrepancy)`,
  ],
  ['GRNs', `DELETE FROM inventory.grn WHERE id IN (SELECT id FROM seed_grn)`],
  [
    '',
    `DELETE FROM core.processed_event WHERE event_id IN (SELECT id FROM seed_event)`,
  ],
  [
    'events',
    `DELETE FROM core.outbox_event WHERE id IN (SELECT id FROM seed_event)`,
  ],
  ['bin stock rows', `DELETE FROM inventory.bin_stock WHERE ${ITEM_OR_BIN}`],
  [
    'stock balances',
    `DELETE FROM inventory.stock_balance WHERE item_id IN (SELECT id FROM seed_item)`,
  ],
  [
    'items',
    `DELETE FROM inventory.item WHERE id IN (SELECT id FROM seed_item)`,
  ],
  ['bins', `DELETE FROM inventory.bin WHERE id IN (SELECT id FROM seed_bin)`],
  [
    'zones',
    `DELETE FROM inventory.zone z WHERE id IN (SELECT id FROM seed_created WHERE entity_key = 'inventory.zone') AND NOT EXISTS (SELECT 1 FROM inventory.bin b WHERE b.zone_id = z.id)`,
  ],
  [
    'machine models',
    `DELETE FROM inventory.machine_model m WHERE id IN (SELECT id FROM seed_created WHERE entity_key = 'inventory.machine_model') AND NOT EXISTS (SELECT 1 FROM inventory.item_machine_model x WHERE x.machine_model_id = m.id) AND NOT EXISTS (SELECT 1 FROM inventory.warranty_tag w WHERE w.machine_model_id = m.id)`,
  ],
  [
    'brands',
    `DELETE FROM inventory.brand b WHERE id IN (SELECT id FROM seed_created WHERE entity_key = 'inventory.brand') AND NOT EXISTS (SELECT 1 FROM inventory.item i WHERE i.brand_id = b.id) AND NOT EXISTS (SELECT 1 FROM inventory.machine_model m WHERE m.brand_id = b.id)`,
  ],
  [
    'customers',
    `DELETE FROM parties.customer WHERE id IN (SELECT id FROM seed_customer)`,
  ],
  [
    'suppliers',
    `DELETE FROM parties.supplier WHERE id IN (SELECT id FROM seed_supplier)`,
  ],
];

// Put the customer and supplier counters back to the highest code still in
// use, so the next one you add carries on from there. A counter can't be 0,
// so one with no codes left is removed and starts again from 1.
const HIGHEST = `
  WITH highest AS (
    SELECT 'CUS' AS doc, coalesce(max(substring(code FROM '^CUS-([0-9]+)$')::int), 0) AS n FROM parties.customer
    UNION ALL
    SELECT 'SUP', coalesce(max(substring(code FROM '^SUP-([0-9]+)$')::int), 0) FROM parties.supplier
  )`;
// Document numbers restart only when no numbered document of that kind is
// left, so a number is never handed out twice.
const DOC_TABLES: [docType: string, table: string][] = [
  ['CNT', 'inventory.stock_count'],
  ['GRN', 'inventory.grn'],
  ['HLD', 'inventory.hold'],
  ['MRN', 'inventory.mrn'],
  ['AOD', 'inventory.aod'],
  ['RTN', 'inventory.return_note'],
  ['WTY', 'inventory.warranty_tag'],
];
const COUNTERS = [
  `${HIGHEST}
  UPDATE core.number_counter c SET last_value = h.n
  FROM core.number_series s, highest h
  WHERE c.series_id = s.id AND s.doc_type = h.doc AND s.subtype = ''
    AND h.n > 0 AND c.last_value > h.n`,
  `${HIGHEST}
  DELETE FROM core.number_counter c
  USING core.number_series s, highest h
  WHERE c.series_id = s.id AND s.doc_type = h.doc AND s.subtype = '' AND h.n = 0`,
  ...DOC_TABLES.map(
    ([
      doc,
      table,
    ]) => `DELETE FROM core.number_counter c USING core.number_series s
  WHERE c.series_id = s.id AND s.doc_type = '${doc}'
    AND NOT EXISTS (SELECT 1 FROM ${table} WHERE number IS NOT NULL)`,
  ),
];

// The seed account ids are fixed values from stores-seed-data.ts, written
// into the SQL directly because CREATE TABLE AS cannot take parameters.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!SEED_USER_IDS.every((id) => UUID.test(id))) {
  throw new Error('Seed account ids must be UUIDs.');
}
const SEED_IDS = `ARRAY[${SEED_USER_IDS.map((id) => `'${id}'`).join(', ')}]::uuid[]`;

function sqlFor(statement: string): string {
  return statement.replaceAll('$1::uuid[]', SEED_IDS);
}

function run(tx: Tx, statement: string): Promise<number> {
  return tx.$executeRawUnsafe(sqlFor(statement));
}

async function countOf(tx: Tx, statement: string): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ count: bigint }[]>(sqlFor(statement));
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const url = process.env['MIGRATOR_DATABASE_URL'];
  if (!url)
    throw new Error(
      'MIGRATOR_DATABASE_URL is not set. Run through pnpm db:unseed:stores.',
    );
  assertLocalDatabase(url);

  const prisma = new PrismaService({ url, applicationName: 'dax-unseed' });
  try {
    const seeded = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      sqlFor('SELECT count(*) FROM auth."user" WHERE id = ANY($1::uuid[])'),
    );
    if (Number(seeded[0]?.count ?? 0) === 0) {
      console.log('No stores seed found in this database. Nothing to remove.');
      return;
    }

    const removed = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE dax_owner');
        for (const statement of SEED_TABLES.split(';')
          .map((s) => s.trim())
          .filter(Boolean)) {
          await run(tx, statement);
        }

        const blockers: string[] = [];
        for (const [label, sql] of BLOCKERS) {
          const n = await countOf(tx, sql);
          if (n > 0) blockers.push(`  ${n} ${label}`);
        }
        if (blockers.length > 0) {
          throw new Blocked(
            [
              'Nothing was removed. These records of yours use the seeded data:',
              ...blockers,
              'Delete or cancel them first, then run this again.',
            ].join('\n'),
          );
        }

        const counts: string[] = [];
        for (const [label, sql] of DELETES) {
          const n = await run(tx, sql);
          if (label && n > 0) counts.push(`${n} ${label}`);
        }
        for (const statement of COUNTERS) await tx.$executeRawUnsafe(statement);

        await tx.$executeRawUnsafe(
          'ALTER TABLE audit.audit_log DISABLE TRIGGER audit_log_append_only',
        );
        const audit = await run(
          tx,
          'DELETE FROM audit.audit_log WHERE actor_id = ANY($1::uuid[])',
        );
        await tx.$executeRawUnsafe(
          'ALTER TABLE audit.audit_log ENABLE TRIGGER audit_log_append_only',
        );
        if (audit > 0) counts.push(`${audit} audit entries`);

        await run(tx, 'DELETE FROM auth."user" WHERE id = ANY($1::uuid[])');
        counts.push('the 2 seed accounts');
        return counts;
      },
      { timeout: 120_000 },
    );

    console.log('Removed the stores seed:');
    for (const line of removed) console.log(`  ${line}`);
  } catch (error) {
    if (error instanceof Blocked) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
