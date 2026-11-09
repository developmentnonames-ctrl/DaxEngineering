import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { AppName } from '@dax/platform-contract';
import type { Policy } from '../acm/policy';

export interface Actor {
  id: string;
  name: string;
}

export interface RequestContextData {
  requestId?: string;
  ip?: string | null;
  app?: AppName;
  actor?: Actor;
  policy?: Policy;
}

@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService) {}

  get(): RequestContextData {
    if (!this.cls.isActive()) return {};
    return {
      requestId: this.cls.get('requestId'),
      ip: this.cls.get('ip'),
      app: this.cls.get('app'),
      actor: this.cls.get('actor'),
      policy: this.cls.get('policy'),
    };
  }

  set(data: Partial<RequestContextData>): void {
    if (!this.cls.isActive()) return;
    for (const [key, value] of Object.entries(data)) this.cls.set(key, value);
  }

  policy(): Policy {
    const policy = this.cls.isActive() ? this.cls.get('policy') : undefined;
    if (!policy) throw new Error('No policy in request context');
    return policy as Policy;
  }
}
