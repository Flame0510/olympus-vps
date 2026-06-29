import { NextResponse, type NextRequest } from 'next/server';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET,
);
const OLYMPUS_PASSWORD =
  process.env.OLYMPUS_PASSWORD;

if (!OLYMPUS_PASSWORD) {
  console.error('[auth] Fatal: OLYMPUS_PASSWORD not set in environment. Server will reject all logins.');
}
if (!process.env.OLYMPUS_JWT_SECRET) {
  console.error('[auth] Fatal: OLYMPUS_JWT_SECRET not set in environment.');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { password } = (await request.json()) as { password?: string };
    if (!password || password !== OLYMPUS_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
    const token = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);
    const response = NextResponse.json({ ok: true });
    response.cookies.set('olympus_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
