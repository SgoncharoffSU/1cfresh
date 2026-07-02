import { Suspense } from 'react';
import { ClientDetail } from '@/components/clients/ClientDetail';
export default function ClientDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="h-full overflow-y-auto">
      <Suspense>
        <ClientDetail clientId={params.id} />
      </Suspense>
    </div>
  );
}
