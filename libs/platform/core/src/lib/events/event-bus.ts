import { Injectable } from '@nestjs/common';
import type { Prisma, TransactionClient } from '@dax/platform-db';
import { type EventDef, type EventInput, parsePayload } from './event';

@Injectable()
export class EventBus {
  async publish<E extends EventDef>(
    tx: TransactionClient,
    event: E,
    payload: EventInput<E>,
  ): Promise<string> {
    const stored: unknown = JSON.parse(
      JSON.stringify(parsePayload(event, payload)),
    );
    // Consumers parse the stored JSON, so it must still satisfy the schema.
    parsePayload(event, stored);
    const row = await tx.outboxEvent.create({
      data: { name: event.name, payload: stored as Prisma.InputJsonObject },
      select: { id: true },
    });
    return row.id;
  }
}
