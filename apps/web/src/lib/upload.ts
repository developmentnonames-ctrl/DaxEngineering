const MAX_BYTES = 15 * 1024 * 1024;

export type UploadResult = { id: string } | { error: string };

function messageOf(text: string): string | null {
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && 'message' in body) {
      const { message } = body;
      if (typeof message === 'string') return message;
    }
    return null;
  } catch {
    return text && text.length < 200 ? text : null;
  }
}

function idOf(text: string): string | null {
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && 'id' in body) {
      const { id } = body;
      if (typeof id === 'string') return id;
    }
  } catch {
    return null;
  }
  return null;
}

export async function uploadAttachment(
  entityKey: string,
  entityId: string,
  kind: string,
  file: File,
): Promise<UploadResult> {
  if (file.size > MAX_BYTES)
    return { error: `${file.name} is larger than 15 MB.` };
  const form = new FormData();
  form.set('entityKey', entityKey);
  form.set('entityId', entityId);
  form.set('kind', kind);
  form.set('file', file);
  try {
    const res = await fetch('/api/files', { method: 'POST', body: form });
    const text = await res.text();
    if (res.ok) {
      const id = idOf(text);
      return id ? { id } : { error: 'The upload could not be confirmed.' };
    }
    return { error: messageOf(text) ?? `${file.name} could not be uploaded.` };
  } catch {
    return { error: 'The upload failed. Check the connection and try again.' };
  }
}
