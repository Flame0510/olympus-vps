/**
 * POST /api/vault/permissions  — imposta permessi agente
 * DEL  /api/vault/permissions  — remove agent permissions (body: { agentId })
 * GET  /api/vault/permissions  — risolvi env vars per agente (query: agentId)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  setAgentPermissions,
  removeAgentPermissions,
  resolveAgentEnv,
} from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { agentId, providers, services } = await request.json();
    if (!agentId || !providers || !services) {
      return NextResponse.json(
        { error: 'agentId, providers, services richiesti' },
        { status: 400 }
      );
    }

    const perm = setAgentPermissions(agentId, providers, services);
    return NextResponse.json({ status: 'ok', permissions: perm });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { agentId } = await request.json();
    if (!agentId) {
      return NextResponse.json({ error: 'agentId richiesto' }, { status: 400 });
    }

    const removed = removeAgentPermissions(agentId);
    return NextResponse.json({ status: removed ? 'removed' : 'not_found' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    if (!agentId) {
      return NextResponse.json({ error: 'agentId query param richiesto' }, { status: 400 });
    }

    const env = resolveAgentEnv(agentId);
    // Mascheriamo le API key nella risposta
    const maskedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      maskedEnv[key] = value.length > 8
        ? value.slice(0, 4) + '…' + value.slice(-4)
        : '***';
    }

    return NextResponse.json({
      agentId,
      envVarCount: Object.keys(env).length,
      envVars: maskedEnv,
      _note: 'Le env vars reali vengono iniettate solo all\'avvio del container agente',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
