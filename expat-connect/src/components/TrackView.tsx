'use client';
import { useEffect } from 'react';

export function track(professionalId: string, eventType: string) {
  fetch('/api/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ professional_id: professionalId, event_type: eventType }), keepalive: true
  }).catch(() => {});
}
export default function TrackView({ professionalId }: { professionalId: string }) {
  useEffect(() => { track(professionalId, 'view'); }, [professionalId]);
  return null;
}
