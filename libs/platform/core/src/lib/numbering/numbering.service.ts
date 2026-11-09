import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { TransactionClient } from '@dax/platform-db';
import { fiscalYearOf, formatDocNumber } from '@dax/util';

export interface NextNumberInput {
  docType: string;
  subtype?: string;
  date: Date;
}

export interface DocNumber {
  number: string;
  seq: number;
  periodKey: string;
}

export interface SeriesFormat {
  docType: string;
  subtype: string;
  pattern: string;
  padding: number;
}

export function formatSeriesNumber(
  series: SeriesFormat,
  date: Date,
  seq: number,
): DocNumber {
  const fy = fiscalYearOf(date);
  return {
    number: formatDocNumber(
      {
        doc: series.docType,
        sub: series.subtype || undefined,
        fy: fy.label,
        seq,
      },
      series.pattern,
      series.padding,
    ),
    seq,
    periodKey: fy.periodKey,
  };
}

@Injectable()
export class NumberingService {
  async next(
    tx: TransactionClient,
    input: NextNumberInput,
  ): Promise<DocNumber> {
    const subtype = input.subtype ?? '';
    const series = await tx.numberSeries.findUnique({
      where: { docType_subtype: { docType: input.docType, subtype } },
    });
    if (!series || !series.active || series.removedAt) {
      const name = subtype ? `${input.docType}/${subtype}` : input.docType;
      throw new UnprocessableEntityException({
        code: 'NUMBER_SERIES_UNAVAILABLE',
        message: `There is no active number series for ${name}.`,
      });
    }
    const { periodKey } = fiscalYearOf(input.date);
    // The upsert's row lock serializes concurrent posts; a rollback hands the number back.
    const [counter] = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO core.number_counter (series_id, period_key, last_value)
      VALUES (${series.id}::uuid, ${periodKey}, 1)
      ON CONFLICT (series_id, period_key)
      DO UPDATE SET last_value = core.number_counter.last_value + 1
      RETURNING last_value`;
    if (!counter) throw new Error('Number counter upsert returned no row');
    return formatSeriesNumber(series, input.date, Number(counter.last_value));
  }

  preview(series: SeriesFormat, date: Date): DocNumber {
    return formatSeriesNumber(series, date, 1);
  }
}
