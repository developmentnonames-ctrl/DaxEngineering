import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { parse } from '../admin/common';
import type { DaxRequest } from '../auth/internal-caller';
import { Authenticated, sessionOf } from '../auth/session.guard';
import { MAX_UPLOAD_BYTES } from './content-type';
import {
  type AttachmentSummary,
  type DownloadUrl,
  FilesService,
} from './files.service';

const EntityRef = z.object({
  entityKey: z
    .string()
    .max(100)
    .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  entityId: z.uuid(),
});

const UploadFields = EntityRef.extend({
  kind: z
    .string()
    .max(40)
    .regex(/^[a-z][a-z0-9_-]*$/),
});

interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
}

const UUID = new ParseUUIDPipe({ version: '7' });

@Controller('attachments')
@Authenticated()
export class AttachmentsController {
  constructor(private readonly files: FilesService) {}

  @Post()
  // No storage or dest given, so multer keeps the file in memory.
  @UseInterceptors(
    FileInterceptor('file', {
      defParamCharset: 'utf8',
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 5,
        fieldSize: 1024,
        parts: 6,
      },
    }),
  )
  upload(
    @Req() req: DaxRequest,
    @Body() body: unknown,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<AttachmentSummary> {
    const { user, policy } = sessionOf(req);
    const fields = parse(UploadFields, body);
    if (!file) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Choose a file to upload.',
        fields: ['file'],
      });
    }
    return this.files.upload(
      { ...fields, fileName: file.originalname, buffer: file.buffer },
      policy,
      user,
    );
  }

  @Get()
  list(
    @Req() req: DaxRequest,
    @Query() query: unknown,
  ): Promise<AttachmentSummary[]> {
    const { entityKey, entityId } = parse(EntityRef, query);
    return this.files.list(entityKey, entityId, sessionOf(req).policy);
  }

  @Get(':id/download-url')
  downloadUrl(
    @Req() req: DaxRequest,
    @Param('id', UUID) id: string,
  ): Promise<DownloadUrl> {
    return this.files.downloadUrl(id, sessionOf(req).policy);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: DaxRequest, @Param('id', UUID) id: string): Promise<void> {
    return this.files.remove(id, sessionOf(req).policy);
  }
}
