import { requireAuth } from '@/lib/requireAuth';
import GatewayPageClient from './PageClient';

export default async function GatewayPage() {
  await requireAuth();
  return <GatewayPageClient />;
}
