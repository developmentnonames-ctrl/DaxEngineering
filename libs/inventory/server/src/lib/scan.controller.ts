import { Controller, Get, Header, Param, Query, Req } from '@nestjs/common';
import { QR_TOKEN_PATTERN, type ScanResult } from '@dax/inventory-contract';
import { Authenticated, type DaxRequest, sessionOf } from '@dax/platform-core';
import { qrKindOf } from './scan-code';
import { ScanService } from './scan.service';

const MAX_CODE_LENGTH = 512;

@Controller('inventory')
export class ScanController {
  constructor(private readonly scan: ScanService) {}

  @Get('scan')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  resolve(
    @Req() req: DaxRequest,
    @Query('code') code: unknown,
  ): Promise<ScanResult> | ScanResult {
    if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH)
      return { type: 'none' };
    return this.scan.resolve(sessionOf(req).policy, code);
  }

  @Get('qr/:kind/:token')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  qr(
    @Req() req: DaxRequest,
    @Param('kind') kind: string,
    @Param('token') token: string,
  ): Promise<ScanResult> | ScanResult {
    const type = qrKindOf(kind);
    if (!type || !QR_TOKEN_PATTERN.test(token)) return { type: 'none' };
    return this.scan.byToken(sessionOf(req).policy, type, token);
  }
}
