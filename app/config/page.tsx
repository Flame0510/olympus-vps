import { requireAuth } from '@/lib/requireAuth';
import ConfigPageClient from './PageClient';

export const dynamic = 'force-dynamic';

export default async function ConfigPage() {
  await requireAuth();
  return <ConfigPageClient />;
}
