'use client';

import { ActionIcon, Alert, Button, Group, Stack } from '@mantine/core';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  startTransition,
  useActionState,
  useRef,
  useState,
} from 'react';
import { Empty, Icon } from '@dax/web-shell';
import { IDLE } from '../../../../../lib/action-state';
import { formatDateTime } from '../../../../../lib/format';
import { uploadAttachment } from '../../../../../lib/upload';
import { refreshTag, removePhoto } from '../_lib/actions';
import { WARRANTY_ENTITY } from '../_lib/labels';

export interface PhotoFile {
  id: string;
  fileName: string;
  createdAt: string;
}

export function Photos({
  tagId,
  photos,
  canEdit,
}: {
  tagId: string;
  photos: PhotoFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [removeState, remove, removing] = useActionState(removePhoto, IDLE);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setErrors([]);
    const failed: string[] = [];
    let added = 0;
    for (const file of files) {
      const result = await uploadAttachment(
        WARRANTY_ENTITY,
        tagId,
        'photo',
        file,
      );
      if ('error' in result) failed.push(result.error);
      else added += 1;
    }
    setErrors(failed);
    setBusy(false);
    if (added) {
      await refreshTag(tagId);
      router.refresh();
    }
  }

  return (
    <Stack gap="md">
      {photos.length ? (
        <div className="dax-photos">
          {photos.map((p) => (
            <div key={p.id} style={{ position: 'relative' }}>
              <a
                href={`/files/${p.id}`}
                target="_blank"
                rel="noreferrer"
                className="dax-photo"
              >
                <span className="ph">
                  <Icon name="camera" size={28} />
                </span>
                <span title={p.fileName}>{p.fileName}</span>
                <span className="dax-sub">{formatDateTime(p.createdAt)}</span>
              </a>
              {canEdit ? (
                <ActionIcon
                  variant="default"
                  aria-label={`Remove ${p.fileName}`}
                  loading={removing}
                  onClick={() => {
                    if (!window.confirm(`Remove ${p.fileName}?`)) return;
                    startTransition(() => remove({ id: tagId, photoId: p.id }));
                  }}
                  style={{ position: 'absolute', top: 6, right: 6 }}
                >
                  <Icon name="close" size={16} />
                </ActionIcon>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No photos yet">
          {canEdit
            ? 'Photograph the failed part, its label and the serial plate.'
            : undefined}
        </Empty>
      )}
      {[...errors, ...(removeState.error ? [removeState.error] : [])].map(
        (e) => (
          <Alert key={e} color="red">
            {e}
          </Alert>
        ),
      )}
      {canEdit ? (
        <Group>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void onFiles(e)}
          />
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            hidden
            onChange={(e) => void onFiles(e)}
          />
          <Button
            size="lg"
            leftSection={<Icon name="camera" size={20} />}
            loading={busy}
            onClick={() => camera.current?.click()}
          >
            Take a photo
          </Button>
          <Button
            size="lg"
            variant="default"
            leftSection={<Icon name="upload" size={20} />}
            disabled={busy}
            onClick={() => picker.current?.click()}
          >
            Choose files
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}
