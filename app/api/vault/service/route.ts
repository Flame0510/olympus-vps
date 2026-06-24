/**
 * POST /api/vault/service  — save service credential
 * DEL  /api/vault/service  — remove service credential (body: { service })
 */

import { NextRequest, NextResponse } from 'next/server';
import { setServiceCredential, removeService } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { service, token, user } = await request.json();
    if (!service || !token) {
      return NextResponse.json({ error: 'service e token richiesti' }, { status: 400 });
    }

    const cred = setServiceCredential(service, token, user || undefined);
    return NextResponse.json({
      status: 'ok',
      service: cred.service,
      masked: cred.token.slice(0, 4) + '…' + cred.token.slice(-4),
      user: cred.user,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { service } = await request.json();
    if (!service) {
      return NextResponse.json({ error: 'service richiesto' }, { status: 400 });
    }

    const removed = removeService(service);
    return NextResponse.json({ status: removed ? 'removed' : 'not_found' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
