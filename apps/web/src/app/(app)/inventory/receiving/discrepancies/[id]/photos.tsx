'use client';

import { Alert, Button, Group, Stack } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Empty, Icon } from '@dax/web-shell';
import { formatDateTime } from '../../../../../../lib/format';
import { refreshDiscrepancy } from '../../_lib/actions';

const MAX_BYTES = 15 * 1024 * 1024;

export interface PhotoFile {
  id: string;
  fileName: string;
  createdAt: string;
}

async function uploadOne(
  entityKey: string,
  entityId: string,
  file: File,
): Promise<string | null> {
  if (file.size > MAX_BYTES) return `${file.name} is larger than 15 MB.`;
  const form = new FormData();
  form.set('entityKey', entityKey);
  form.set('entityId', entityId);
  form.set('kind', 'photo');
  form.set('file', file);
  try {
    const res = await fetch('/api/files', { method: 'POST', body: form });
    if (res.ok) return null;
    const text = await res.text();
    try {
      const body: unknown = JSON.parse(text);
      if (body && typeof body === 'object' && 'message' in body) {
        const { message } = body;
        if (typeof message === 'string') return message;
      }
    } catch {
      if (text && text.length < 200) return text;
    }
    return `${file.name} could not be uploaded.`;
  } catch {
    return 'The upload failed. Check the connection and try again.';
  }
}

export function Photos({
  entityKey,
  discrepancyId,
  photos,
  canUpload,
}: {
  entityKey: string;
  discrepancyId: string;
  photos: PhotoFile[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);

  const urls = useRef<string[]>([]);

  useEffect(() => {
    const created = urls.current;
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, []);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setErrors([]);
    const failed: string[] = [];
    const added: { url: string; name: string }[] = [];
    for (const file of files) {
      const error = await uploadOne(entityKey, discrepancyId, file);
      if (error) failed.push(error);
      else {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        added.push({ url, name: file.name });
      }
    }
    setErrors(failed);
    setPreviews((prev) => [...added, ...prev]);
    setBusy(false);
    if (added.length) {
      await refreshDiscrepancy(discrepancyId);
      router.refresh();
    }
  }

  return (
    <Stack gap="md">
      {previews.length ? (
        <div className="dax-photos">
          {previews.map((p) => (
            <div key={p.url} className="dax-photo">
              <img src={p.url} alt={p.name} />
              <span>Just added</span>
            </div>
          ))}
        </div>
      ) : null}
      {photos.length ? (
        <div className="dax-photos">
          {photos.map((p) => (
            <a
              key={p.id}
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
          ))}
        </div>
      ) : previews.length === 0 ? (
        <Empty title="No photos yet">
          {canUpload
            ? 'Photograph the damage, the label and the packaging.'
            : undefined}
        </Empty>
      ) : null}
      {errors.map((e) => (
        <Alert key={e} color="red">
          {e}
        </Alert>
      ))}
      {canUpload ? (
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
