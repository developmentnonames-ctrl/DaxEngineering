import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, type Provider } from '@nestjs/common';
import type { Decryptor } from '../acm/visibility';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID = /^[a-z0-9]{1,16}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export class KeyRingError extends Error {}
export class FieldCryptoError extends Error {}

export interface KeyRing {
  keys: ReadonlyMap<string, Buffer>;
  active: string;
}

export interface FieldCryptoOptions {
  keys: string;
  activeKey: string;
}

export function parseKeyRing(keys: string, active: string): KeyRing {
  const entries = keys
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  if (entries.length === 0) {
    throw new KeyRingError('DATA_ENCRYPTION_KEYS has no keys');
  }
  const ring = new Map<string, Buffer>();
  entries.forEach((entry, index) => {
    const at = `DATA_ENCRYPTION_KEYS entry ${index + 1}`;
    const colon = entry.indexOf(':');
    if (colon < 0)
      throw new KeyRingError(`${at} must look like "<id>:<base64>"`);
    const id = entry.slice(0, colon);
    const material = entry.slice(colon + 1);
    if (!KEY_ID.test(id)) {
      throw new KeyRingError(`${at} has an invalid id (use 1-16 of a-z, 0-9)`);
    }
    if (ring.has(id)) throw new KeyRingError(`${at} repeats key id "${id}"`);
    const key = BASE64.test(material) ? Buffer.from(material, 'base64') : null;
    if (!key || key.length !== KEY_BYTES) {
      throw new KeyRingError(
        `${at} (key "${id}") must be ${KEY_BYTES} bytes encoded as base64`,
      );
    }
    ring.set(id, key);
  });
  const activeId = active.trim();
  if (!ring.has(activeId)) {
    throw new KeyRingError(
      `DATA_ENCRYPTION_ACTIVE_KEY must be one of the configured key ids: ${[...ring.keys()].join(', ')}`,
    );
  }
  return { keys: ring, active: activeId };
}

export function aadFor(
  entityKey: string,
  field: string,
  rowId: string,
): string {
  return `${entityKey}.${field}:${rowId}`;
}

export function activePrefix(keyId: string): string {
  return `${VERSION}:${keyId}:`;
}

interface Envelope {
  keyId: string;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

function parseEnvelope(envelope: string): Envelope {
  const parts = envelope.split(':');
  if (
    parts.length !== 4 ||
    parts[0] !== VERSION ||
    !KEY_ID.test(parts[1]) ||
    !BASE64URL.test(parts[2]) ||
    !BASE64URL.test(parts[3])
  ) {
    throw new FieldCryptoError('Encrypted value is malformed');
  }
  const iv = Buffer.from(parts[2], 'base64url');
  const sealed = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || sealed.length < TAG_BYTES) {
    throw new FieldCryptoError('Encrypted value is malformed');
  }
  return {
    keyId: parts[1],
    iv,
    ciphertext: sealed.subarray(0, sealed.length - TAG_BYTES),
    tag: sealed.subarray(sealed.length - TAG_BYTES),
  };
}

@Injectable()
export class FieldCrypto {
  readonly activeKeyId: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(ring: KeyRing) {
    this.keys = ring.keys;
    this.activeKeyId = ring.active;
  }

  static fromOptions(options: FieldCryptoOptions): FieldCrypto {
    return new FieldCrypto(parseKeyRing(options.keys, options.activeKey));
  }

  encrypt(aad: string, plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key(this.activeKeyId), iv, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const sealed = Buffer.concat([ciphertext, cipher.getAuthTag()]);
    return `${activePrefix(this.activeKeyId)}${iv.toString('base64url')}:${sealed.toString('base64url')}`;
  }

  decrypt(aad: string, envelope: string): string {
    const { keyId, iv, ciphertext, tag } = parseEnvelope(envelope);
    const decipher = createDecipheriv(ALGORITHM, this.key(keyId), iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new FieldCryptoError(
        `Encrypted value failed authentication (${aad})`,
      );
    }
  }

  needsRotation(envelope: string): boolean {
    return !envelope.startsWith(activePrefix(this.activeKeyId));
  }

  readonly decryptor: Decryptor = (entityKey, field, rowId, value) =>
    this.decrypt(aadFor(entityKey, field, rowId), value);

  private key(keyId: string): Buffer {
    const key = this.keys.get(keyId);
    if (!key)
      throw new FieldCryptoError(`Unknown encryption key id "${keyId}"`);
    return key;
  }
}

export function fieldCryptoProvider(options: FieldCryptoOptions): Provider {
  return {
    provide: FieldCrypto,
    useFactory: () => FieldCrypto.fromOptions(options),
  };
}
