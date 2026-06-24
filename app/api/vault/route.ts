/**
 * API Vault — Gestione credenziali centralizzate
 * 
 * GET  /api/vault              — lista tutto (provider mascherati, servizi, permessi)
 * GET  /api/vault/provider/{p} — dettaglio provider (key mascherata)
 * POST /api/vault/provider     — save provider
 * DEL  /api/vault/provider/{p} — remove provider
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllProviders,
  getProviderCredential,
  setProviderCredential,
  removeProvider,
  getAllServices,
  setServiceCredential,
  removeService,
  getAllPermissions,
  setAgentPermissions,
  removeAgentPermissions,
  resolveAgentEnv,
} from '@/lib/vault';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const providers = getAllProviders();
  const services = getAllServices();
  const permissions = getAllPermissions();

  return NextResponse.json({
    providers,
    services,
    permissions,
    _note: 'Use POST /api/vault/provider to save an API key',
  });
}
