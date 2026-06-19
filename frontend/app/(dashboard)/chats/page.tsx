import { Suspense } from 'react';
import { ChatCRM } from '@/components/chat/ChatCRM';
export default function ChatsPage() {
  return <Suspense><ChatCRM /></Suspense>;
}
