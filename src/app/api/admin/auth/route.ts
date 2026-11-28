import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE_NAME,
  createAdminSessionToken,
  getMissingAdminEnv,
  isAdminAuthenticated,
  verifyAdminPassword,
} from '@/lib/adminAuth';

export async function GET() {
  const missing = getMissingAdminEnv();
  const authenticated = missing.length === 0 ? await isAdminAuthenticated() : false;
  return NextResponse.json({
    authenticated,
    configured: missing.length === 0,
    missing,
  });
}

export async function POST(req: Request) {
  const missing = getMissingAdminEnv();
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing Vercel environment variables: ${missing.join(', ')}` },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body?.password || '');

  if (!verifyAdminPassword(password)) {
    return NextResponse.json({ error: 'Incorrect admin passcode.' }, { status: 401 });
  }

  const token = createAdminSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
