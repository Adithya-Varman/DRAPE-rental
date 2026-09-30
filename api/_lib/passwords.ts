// Password hashing. New hashes use scrypt from node:crypto; accounts migrated from Supabase Auth carry bcrypt hashes,
// which verify here and are upgraded to scrypt on their next successful login.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import bcrypt from 'bcryptjs'

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))))

const N = 16384, R = 8, P = 1, KEYLEN = 64
export const MIN_PASSWORD_LENGTH = 8

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(stored: string | null, password: string): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored) return { ok: false, needsRehash: false }
  if (stored.startsWith('scrypt$')) {
    const [, n, r, p, salt, hash] = stored.split('$')
    const expected = Buffer.from(hash, 'base64')
    const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })
    return { ok: actual.length === expected.length && timingSafeEqual(actual, expected), needsRehash: Number(n) !== N }
  }
  if (/^\$2[aby]\$/.test(stored)) return { ok: await bcrypt.compare(password, stored), needsRehash: true }
  return { ok: false, needsRehash: false }
}

// Spend the same time on unknown emails as on real ones, so response time doesn't reveal which emails have accounts.
let dummy: Promise<string> | null = null
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('not-a-real-password')
  await verifyPassword(await dummy, password)
}
