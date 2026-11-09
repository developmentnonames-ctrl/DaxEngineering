import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { ImportResult } from '@dax/contracts';
import {
  ArchiveInput,
  type CustomerDto,
  type CustomerPage,
  PartyImportQuery,
} from '@dax/parties-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { csvTemplate } from './csv-import';
import { actorOf, importText, parse } from './http';
import { CUSTOMERS } from './kinds';
import { PartiesService } from './parties.service';

@Controller('parties/customers')
export class CustomersController {
  constructor(private readonly parties: PartiesService) {}

  @Get()
  @Requires('parties.customer.view')
  list(@Req() req: DaxRequest, @Query() query: unknown): Promise<CustomerPage> {
    return this.parties.list(CUSTOMERS, sessionOf(req).policy, query);
  }

  @Get('import/template')
  @Requires('parties.customer.import')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  template(): string {
    return csvTemplate(CUSTOMERS.csvColumns);
  }

  @Post('import')
  @Requires('parties.customer.import')
  @HttpCode(200)
  importCsv(
    @Req() req: DaxRequest,
    @Query() query: unknown,
    @Body() body: unknown,
  ): Promise<ImportResult> {
    const { dryRun } = parse(PartyImportQuery, query);
    return this.parties.importCsv(
      CUSTOMERS,
      actorOf(req),
      importText(body),
      dryRun,
    );
  }

  @Get(':id')
  @Requires('parties.customer.view')
  get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerDto> {
    return this.parties.get(CUSTOMERS, sessionOf(req).policy, id);
  }

  @Post()
  @Requires('parties.customer.create')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<CustomerDto> {
    return this.parties.create(CUSTOMERS, actorOf(req), body);
  }

  @Patch(':id')
  @Requires('parties.customer.edit')
  update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CustomerDto> {
    return this.parties.update(CUSTOMERS, actorOf(req), id, body);
  }

  @Post(':id/archive')
  @Requires('parties.customer.archive')
  @HttpCode(200)
  archive(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CustomerDto> {
    const { version } = parse(ArchiveInput, body);
    return this.parties.setActive(CUSTOMERS, actorOf(req), id, version, false);
  }

  @Post(':id/restore')
  @Requires('parties.customer.archive')
  @HttpCode(200)
  restore(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CustomerDto> {
    const { version } = parse(ArchiveInput, body);
    return this.parties.setActive(CUSTOMERS, actorOf(req), id, version, true);
  }
}
