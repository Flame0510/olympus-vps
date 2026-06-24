/**
 * POST /api/vault/provider  — save provider credential
 * DEL  /api/vault/provider  — remove provider credential (body: { provider })
 */

import { NextRequest, NextResponse } from 'next/server';
import { setProviderCredential, removeProvider } from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { provider, apiKey, baseUrl } = await request.json();
    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'provider e apiKey richiesti' }, { status: 400 });
    }

    const cred = setProviderCredential(provider, apiKey, baseUrl || undefined);
    return NextResponse.json({
      status: 'ok',
      provider: cred.provider,
      masked: cred.apiKey.slice(0, 4) + '…' + cred.apiKey.slice(-4),
      updatedAt: cred.updatedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { provider } = await request.json();
    if (!provider) {
      return NextResponse.json({ error: 'provider richiesto' }, { status: 400 });
    }

    const removed = removeProvider(provider);
    return NextResponse.json({ status: removed ? 'removed' : 'not_found' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
