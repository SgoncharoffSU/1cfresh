import { cn } from '@/lib/utils';

/** AI-chat logo supplied by the client (speech bubble + neural "brain" linked to a phone) — used for the web/portal channel */
export function AiChatIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/web-chat.png"
      alt="AI чат"
      className={cn('h-4 w-4 object-contain', className)}
    />
  );
}
