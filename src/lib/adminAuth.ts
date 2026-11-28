import crypto from 'crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE_NAME = 'yoma_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

export function verifyAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected || !input) return false;
  return crypto.timingSafeEqual(sha256(input), sha256(expected));
}

function signExpiry(expiresAt: number, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`yoma-admin:${expiresAt}`).digest('hex');
}

export function createAdminSessionToken(): string {
  const secret = process.env.ADMIN_PASSWORD || '';
  if (!secret) throw new Error('ADMIN_PASSWORD is not configured.');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sig = signExpiry(expiresAt, secret);
  return `${expiresAt}.${sig}`;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const secret = process.env.ADMIN_PASSWORD || '';
  if (!secret) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const expiresAt = Number(parts[0]);
  const providedSig = parts[1];
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expectedSig = signExpiry(expiresAt, secret);
  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

export function getMissingAdminEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SECRET_KEY');
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  return missing;
}
