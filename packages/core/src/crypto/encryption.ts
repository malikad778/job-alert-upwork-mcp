import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const VERSION = 1;

function getMasterKey(): Buffer {
  const masterB64 = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterB64) {
    throw new Error('ENCRYPTION_MASTER_KEY environment variable is missing.');
  }
  const key = Buffer.from(masterB64, 'base64');
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_MASTER_KEY must be exactly 32 bytes (got ${key.length}).`);
  }
  return key;
}

/** Format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64> - self-describing, so v2 can coexist. */
export function encrypt(plaintext: string, overrideMasterKey?: Buffer): string {
  const master = overrideMasterKey || getMasterKey();
  const iv = randomBytes(12); // 96-bit nonce, standard and secure for AES-GCM
  const cipher = createCipheriv('aes-256-gcm', master, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [`v${VERSION}`, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decrypt(payload: string, overrideMasterKey?: Buffer): string {
  const [version, ivB64, tagB64, ctB64] = payload.split('.');
  if (!version || !ivB64 || !tagB64 || !ctB64) {
    throw new Error('Malformed encrypted payload format.');
  }
  if (version !== `v${VERSION}`) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }
  const master = overrideMasterKey || getMasterKey();
  const decipher = createDecipheriv('aes-256-gcm', master, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

/** For the secretHint column - never reversible. */
export function hint(secret: string): string {
  if (!secret) return '••••';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}
