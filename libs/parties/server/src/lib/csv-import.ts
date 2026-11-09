import { parse as parseCsv } from 'csv-parse/sync';
import type { ImportResult } from '@dax/contracts';
import { PARTY_IMPORT_MAX_ROWS } from '@dax/parties-contract';
import { snakeCase } from '@dax/platform-core';
import type { z } from 'zod';

export type ImportError = ImportResult['errors'][number];
export type Row = Record<string, unknown>;

export interface CsvSpec {
  columns: readonly string[];
  booleans?: readonly string[];
  schema: z.ZodType<Row>;
  label(field: string): string;
}

export interface CsvRow {
  row: number;
  code: string | null;
  input: Row;
}

export interface ParsedCsv {
  total: number;
  rows: CsvRow[];
  errors: ImportError[];
}

export const CODE_PATTERN = /^[A-Z0-9-]{1,20}$/;
const TRUE_WORDS = new Set(['true', 'yes', 'y', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0']);

export function camelCase(column: string): string {
  return column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function csvTemplate(columns: readonly string[]): string {
  return `${columns.join(',')}\r\n`;
}

function fileError(message: string, field: string | null = null): ImportError {
  return { row: 0, field, message };
}

function lineOf(error: unknown): string {
  const lines = (error as { lines?: unknown }).lines;
  return typeof lines === 'number' ? ` (line ${lines})` : '';
}

function issueMessage(
  issue: z.ZodError['issues'][number],
  label: string,
): string {
  switch (issue.code) {
    case 'invalid_type':
    case 'too_small':
      return `${label} is required.`;
    case 'too_big':
      return `${label} must be at most ${String(issue.maximum)} characters.`;
    default:
      return `${label} is not valid.`;
  }
}

function checkHeader(header: string[], spec: CsvSpec): ImportError[] {
  const errors: ImportError[] = [];
  const seen = new Set<string>();
  for (const column of header) {
    if (!spec.columns.includes(column)) {
      errors.push(
        fileError(
          `Unknown column "${column}". Use the template's columns.`,
          column,
        ),
      );
    } else if (seen.has(column)) {
      errors.push(fileError(`Column "${column}" appears twice.`, column));
    }
    seen.add(column);
  }
  if (!seen.has('name')) {
    errors.push(fileError('The name column is missing.', 'name'));
  }
  return errors;
}

export function parsePartyCsv(
  text: string,
  spec: CsvSpec,
  maxRows = PARTY_IMPORT_MAX_ROWS,
): ParsedCsv {
  let records: string[][];
  try {
    records = parseCsv(text, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
  } catch (error) {
    return {
      total: 0,
      rows: [],
      errors: [fileError(`The file isn't valid CSV${lineOf(error)}.`)],
    };
  }

  const [rawHeader, ...data] = records;
  if (!rawHeader) {
    return { total: 0, rows: [], errors: [fileError('The file is empty.')] };
  }
  const header = rawHeader.map((h) => h.trim().toLowerCase());
  const headerErrors = checkHeader(header, spec);
  if (headerErrors.length)
    return { total: data.length, rows: [], errors: headerErrors };
  if (data.length === 0) {
    return {
      total: 0,
      rows: [],
      errors: [fileError('The file has no rows to import.')],
    };
  }
  if (data.length > maxRows) {
    return {
      total: data.length,
      rows: [],
      errors: [
        fileError(
          `The file has ${data.length} rows. Import at most ${maxRows} at a time.`,
        ),
      ],
    };
  }

  const booleans = new Set(spec.booleans ?? []);
  const codeRows = new Map<string, number>();
  const rows: CsvRow[] = [];
  const errors: ImportError[] = [];

  data.forEach((values, index) => {
    const row = index + 1;
    const rowErrors: ImportError[] = [];
    if (values.slice(header.length).some((v) => v !== '')) {
      rowErrors.push({
        row,
        field: null,
        message: `This row has ${values.length} values but the header has ${header.length} columns.`,
      });
    }

    let code: string | null = null;
    const input: Row = {};
    for (const [i, column] of header.entries()) {
      const value = values[i] ?? '';
      if (value === '') continue;
      if (column === 'code') {
        code = value.toUpperCase();
      } else if (!booleans.has(column)) {
        input[camelCase(column)] = value;
      } else if (TRUE_WORDS.has(value.toLowerCase())) {
        input[camelCase(column)] = true;
      } else if (FALSE_WORDS.has(value.toLowerCase())) {
        input[camelCase(column)] = false;
      } else {
        rowErrors.push({
          row,
          field: column,
          message: `${spec.label(camelCase(column))} must be yes or no.`,
        });
      }
    }

    if (code !== null) {
      const first = codeRows.get(code);
      if (!CODE_PATTERN.test(code)) {
        rowErrors.push({
          row,
          field: 'code',
          message:
            'Codes may only use letters, digits and "-", up to 20 characters.',
        });
      } else if (first !== undefined) {
        rowErrors.push({
          row,
          field: 'code',
          message: `Code ${code} is also used on row ${first}.`,
        });
      } else {
        codeRows.set(code, row);
      }
    }

    const parsed = spec.schema.safeParse(input);
    if (!parsed.success) {
      const fields = new Set<string>();
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        if (fields.has(field)) continue;
        fields.add(field);
        rowErrors.push({
          row,
          field: field ? snakeCase(field) : null,
          message: issueMessage(issue, field ? spec.label(field) : 'This row'),
        });
      }
    }

    if (rowErrors.length) errors.push(...rowErrors);
    else if (parsed.success) rows.push({ row, code, input: parsed.data });
  });

  return { total: data.length, rows, errors };
}
