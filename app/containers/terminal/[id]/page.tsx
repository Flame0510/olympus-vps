import { requireAuth } from '@/lib/requireAuth';
import TerminalClient from './TerminalClient';

export default async function TerminalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  return <TerminalClient containerId={id} />;
}
