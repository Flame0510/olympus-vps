import { NextResponse, type NextRequest } from 'next/server';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET ?? 'olympus-jwt-secret-change-in-prod',
);
const OLYMPUS_PASSWORD =
  process.env.OLYMPUS_PASSWORD ?? process.env.OLYMPUS_TOKEN ?? 'olympus2026';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { password } = (await request.json()) as { password?: string };
    if (!password || password !== OLYMPUS_PASSWORD) {
      return NextResponse.json({ error: 'Password non valida' }, { status: 401 });
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
    return NextResponse.json({ error: 'Errore server' }, { status: 500 });
  }
}
