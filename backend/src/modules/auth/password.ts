import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt with a random per-password salt, from Node's own crypto (no native add-on to build).
// The cost parameters are stored in the hash string, so they can be raised later and old
// hashes keep verifying.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt needs about 128 * N * r bytes; allow twice that so the default limit never trips.
    scrypt(password.normalize('NFKC'), salt, length, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | undefined;

/**
 * Burn the same time as a real check when the email is unknown. Without this, "no such user"
 * answers measurably faster than "wrong password", which tells an attacker who has an account.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hashPassword('not-a-real-password');
  await verifyPassword(password, await dummy);
  return false;
}
