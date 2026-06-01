import { type NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];
const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET ?? 'olympus-jwt-secret-change-in-prod',
);
const OLYMPUS_TOKEN = process.env.OLYMPUS_TOKEN ?? 'olympus2026';

async function issueAuthCookie(response: NextResponse): Promise<void> {
  const jwt = await new SignJWT({ role: 'admin', mode: 'hardcoded-temp' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  response.cookies.set('olympus_token', jwt, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const token = request.cookies.get('olympus_token')?.value;
  if (token) {
    try {
      await jwtVerify(token, JWT_SECRET);
      return NextResponse.next();
    } catch {
      // Temporary permissive mode — bootstrap a fresh cookie on failure.
    }
  }

  const res = NextResponse.next();
  await issueAuthCookie(res);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg|icons|sw.js).*)'],
};
