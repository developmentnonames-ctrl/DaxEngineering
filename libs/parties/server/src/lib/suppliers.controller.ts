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
  type SupplierDto,
  type SupplierPage,
  PartyImportQuery,
} from '@dax/parties-contract';
import { type DaxRequest, Requires, sessionOf } from '@dax/platform-core';
import { csvTemplate } from './csv-import';
import { actorOf, importText, parse } from './http';
import { SUPPLIERS } from './kinds';
import { PartiesService } from './parties.service';

@Controller('parties/suppliers')
export class SuppliersController {
  constructor(private readonly parties: PartiesService) {}

  @Get()
  @Requires('parties.supplier.view')
  list(@Req() req: DaxRequest, @Query() query: unknown): Promise<SupplierPage> {
    return this.parties.list(SUPPLIERS, sessionOf(req).policy, query);
  }

  @Get('import/template')
  @Requires('parties.supplier.import')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="suppliers.csv"')
  template(): string {
    return csvTemplate(SUPPLIERS.csvColumns);
  }

  @Post('import')
  @Requires('parties.supplier.import')
  @HttpCode(200)
  importCsv(
    @Req() req: DaxRequest,
    @Query() query: unknown,
    @Body() body: unknown,
  ): Promise<ImportResult> {
    const { dryRun } = parse(PartyImportQuery, query);
    return this.parties.importCsv(
      SUPPLIERS,
      actorOf(req),
      importText(body),
      dryRun,
    );
  }

  @Get(':id')
  @Requires('parties.supplier.view')
  get(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SupplierDto> {
    return this.parties.get(SUPPLIERS, sessionOf(req).policy, id);
  }

  @Post()
  @Requires('parties.supplier.create')
  create(@Req() req: DaxRequest, @Body() body: unknown): Promise<SupplierDto> {
    return this.parties.create(SUPPLIERS, actorOf(req), body);
  }

  @Patch(':id')
  @Requires('parties.supplier.edit')
  update(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<SupplierDto> {
    return this.parties.update(SUPPLIERS, actorOf(req), id, body);
  }

  @Post(':id/archive')
  @Requires('parties.supplier.archive')
  @HttpCode(200)
  archive(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<SupplierDto> {
    const { version } = parse(ArchiveInput, body);
    return this.parties.setActive(SUPPLIERS, actorOf(req), id, version, false);
  }

  @Post(':id/restore')
  @Requires('parties.supplier.archive')
  @HttpCode(200)
  restore(
    @Req() req: DaxRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<SupplierDto> {
    const { version } = parse(ArchiveInput, body);
    return this.parties.setActive(SUPPLIERS, actorOf(req), id, version, true);
  }
}
