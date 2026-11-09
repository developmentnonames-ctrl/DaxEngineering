import { CustomerInput, SupplierInput } from '@dax/parties-contract';
import { CUSTOMERS, SUPPLIERS } from './kinds';
import { type CsvSpec, csvTemplate, parsePartyCsv } from './csv-import';

const customers: CsvSpec = {
  columns: CUSTOMERS.csvColumns,
  schema: CustomerInput,
  label: (f) => CUSTOMERS.entity.fields[f]?.label ?? f,
};
const suppliers: CsvSpec = {
  columns: SUPPLIERS.csvColumns,
  booleans: SUPPLIERS.csvBooleans,
  schema: SupplierInput,
  label: (f) => SUPPLIERS.entity.fields[f]?.label ?? f,
};

describe('parsePartyCsv', () => {
  it('reads valid rows, maps columns and keeps codes', () => {
    const text =
      '﻿code,name,contact_person,email\r\n' +
      'cus-9,Acme Motors,Head of Stores,stores@acme.test\r\n' +
      ',Beta Garage,,\r\n';
    const result = parsePartyCsv(text, customers);
    expect(result.errors).toEqual([]);
    expect(result.total).toBe(2);
    expect(result.rows).toEqual([
      {
        row: 1,
        code: 'CUS-9',
        input: {
          name: 'Acme Motors',
          contactPerson: 'Head of Stores',
          email: 'stores@acme.test',
        },
      },
      { row: 2, code: null, input: { name: 'Beta Garage' } },
    ]);
  });

  it('reports a bad email and a missing name against their rows', () => {
    const text = 'name,email\nAcme,not-an-email\n,ok@acme.test\n';
    const { errors, rows } = parsePartyCsv(text, customers);
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      { row: 1, field: 'email', message: 'Email is not valid.' },
      { row: 2, field: 'name', message: 'Name is required.' },
    ]);
  });

  it('flags a code used twice in the file and malformed codes', () => {
    const text = 'code,name\nA-1,One\nA-1,Two\nbad code!,Three\n';
    const { errors } = parsePartyCsv(text, customers);
    expect(errors).toEqual([
      {
        row: 2,
        field: 'code',
        message: 'Code A-1 is also used on row 1.',
      },
      expect.objectContaining({ row: 3, field: 'code' }),
    ]);
  });

  it('rejects unknown and duplicate columns, and a missing name column', () => {
    const { errors } = parsePartyCsv('code,colour,code\nX,red,Y\n', customers);
    expect(errors).toEqual([
      expect.objectContaining({ row: 0, field: 'colour' }),
      expect.objectContaining({ row: 0, field: 'code' }),
      expect.objectContaining({ row: 0, field: 'name' }),
    ]);
  });

  it('rejects files over the row limit without validating rows', () => {
    const text = `name\n${['a', 'b', 'c'].join('\n')}\n`;
    const result = parsePartyCsv(text, customers, 2);
    expect(result.total).toBe(3);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      {
        row: 0,
        field: null,
        message: 'The file has 3 rows. Import at most 2 at a time.',
      },
    ]);
  });

  it('reports empty files, header-only files and broken CSV', () => {
    expect(parsePartyCsv('', customers).errors[0]?.message).toBe(
      'The file is empty.',
    );
    expect(parsePartyCsv('name\n', customers).errors[0]?.message).toBe(
      'The file has no rows to import.',
    );
    expect(parsePartyCsv('name\n"unclosed\n', customers).errors[0]).toEqual(
      expect.objectContaining({ row: 0, field: null }),
    );
  });

  it('flags rows with extra values', () => {
    const { errors } = parsePartyCsv('name\nAcme,extra\nBeta,\n', customers);
    expect(errors).toEqual([expect.objectContaining({ row: 1, field: null })]);
  });

  it('parses yes/no columns for suppliers', () => {
    const text = 'name,is_foreign,country\nA,yes,Japan\nB,,\nC,maybe,\n';
    const { rows, errors } = parsePartyCsv(text, suppliers);
    expect(rows.map((r) => r.input)).toEqual([
      { name: 'A', isForeign: true, country: 'Japan' },
      { name: 'B', isForeign: false },
    ]);
    expect(errors).toEqual([
      {
        row: 3,
        field: 'is_foreign',
        message: 'Foreign supplier must be yes or no.',
      },
    ]);
  });

  it('builds a header-only template', () => {
    expect(csvTemplate(CUSTOMERS.csvColumns)).toBe(
      'code,name,contact_person,phone,email,address,tax_id,notes\r\n',
    );
  });
});
