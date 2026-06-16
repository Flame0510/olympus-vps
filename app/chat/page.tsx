import { requireAuth } from '@/lib/requireAuth';
import ChatClient from './ChatClient';

export default async function ChatPage() {
  await requireAuth();
  return <ChatClient />;
}
