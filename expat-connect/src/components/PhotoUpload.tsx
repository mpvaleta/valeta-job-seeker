'use client';
import { useState } from 'react';

export default function PhotoUpload({ professionalId, currentUrl }: { professionalId: string; currentUrl?: string }) {
  const [preview, setPreview] = useState(currentUrl ?? '');
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setState('error'); setMessage('Imagem deve ter no máximo 3 MB.'); return; }
    setState('uploading'); setMessage('');
    const form = new FormData();
    form.append('professional_id', professionalId);
    form.append('file', file);
    const res = await fetch('/api/upload-photo', { method: 'POST', body: form });
    const data = await res.json();
    if (res.ok) { setPreview(data.photo_url); setState('idle'); }
    else { setState('error'); setMessage(data.error ?? 'Falha no envio.'); }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="h-20 w-20 rounded-full bg-atlantic-soft overflow-hidden flex items-center justify-center shrink-0">
        {preview
          ? <img src={preview} alt="Foto do perfil" className="h-full w-full object-cover" />
          : <span className="text-atlantic/40 text-xs text-center">Sem foto</span>}
      </div>
      <div>
        <label className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-brand inline-block">
          {state === 'uploading' ? 'Enviando…' : 'Enviar foto'}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} disabled={state === 'uploading'} className="hidden" />
        </label>
        <p className="mt-1 text-xs text-ink/50">JPG, PNG ou WebP · até 3 MB</p>
        {state === 'error' && <p className="mt-1 text-xs text-red-600">{message}</p>}
      </div>
    </div>
  );
}
