'use client';
import { track } from '@/components/TrackView';

export default function ContactLinks({ professionalId, whatsapp, website }: { professionalId: string; whatsapp?: string; website?: string }) {
  return (
    <>
      {whatsapp && (
        <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
          onClick={() => track(professionalId, 'whatsapp_click')}
          className="rounded-lg bg-brand px-5 py-2.5 text-white font-medium hover:bg-brand-dark">WhatsApp</a>
      )}
      {website && (
        <a href={website} target="_blank" rel="noopener noreferrer" onClick={() => track(professionalId, 'website_click')}
          className="rounded-lg border border-line px-5 py-2.5 font-medium hover:border-brand">Site</a>
      )}
    </>
  );
}
