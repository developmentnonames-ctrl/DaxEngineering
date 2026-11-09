'use client';

import { Alert, Button, Group, Stack } from '@mantine/core';
import { type ChangeEvent, useRef, useState, useTransition } from 'react';
import { Icon } from '@dax/web-shell';
import { IDLE } from '../../../../../../lib/action-state';
import { uploadAttachment } from '../../../../../../lib/upload';
import { signAod } from '../../_lib/actions';
import { AOD_ENTITY } from '../../_lib/labels';

export function SignUpload({ id, version }: { id: string; version: number }) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const uploaded = await uploadAttachment(AOD_ENTITY, id, 'signed', file);
      if ('error' in uploaded) {
        setError(uploaded.error);
        return;
      }
      const result = await signAod(IDLE, {
        id,
        version,
        attachmentId: uploaded.id,
      });
      if (result.error) setError(result.error);
    });
  }

  return (
    <Stack gap="sm">
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onFile}
      />
      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hidden
        onChange={onFile}
      />
      <Group>
        <Button
          size="lg"
          color="ember"
          loading={pending}
          leftSection={<Icon name="camera" size={20} />}
          onClick={() => camera.current?.click()}
        >
          Photograph signed copy
        </Button>
        <Button
          size="lg"
          variant="default"
          disabled={pending}
          leftSection={<Icon name="upload" size={20} />}
          onClick={() => picker.current?.click()}
        >
          Upload a scan or PDF
        </Button>
      </Group>
      {error ? <Alert color="red">{error}</Alert> : null}
    </Stack>
  );
}
