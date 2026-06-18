import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET ?? 'olympus-jwt-secret-change-in-prod',
);

const TOKEN = process.env.OLYMPUS_TOKEN ?? 'olympus2026';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — no auth required
  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/check' ||
    pathname === '/api/version' ||
    pathname.startsWith('/api/models') ||
    pathname === '/api/agents-config' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon-') ||
    pathname === '/manifest.json'
  ) {
    return NextResponse.next();
  }

  // 1. Check query param token
  const qpToken = request.nextUrl.searchParams.get('token');
  if (qpToken === TOKEN) return NextResponse.next();

  // 2. Check Authorization header
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${TOKEN}`) return NextResponse.next();

  // 3. Check JWT cookie
  const cookieToken = request.cookies.get('olympus_token')?.value;
  if (cookieToken) {
    try {
      await jwtVerify(cookieToken, JWT_SECRET);
      return NextResponse.next();
    } catch {
      // Invalid JWT — fall through to redirect
    }
  }

  // For API routes: return 401 JSON
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // For pages: redirect to /login
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg|icon-192.png|icon-512.png|manifest.json).*)'],
};
