'use client';
import Link from 'next/link';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold text-ink">Algo deu errado</h1>
      <p className="mt-3 text-ink/60">Tivemos um problema ao carregar esta página. Tente novamente.</p>
      <div className="mt-6 flex gap-3 justify-center">
        <button onClick={reset} className="rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark">Tentar de novo</button>
        <Link href="/" className="rounded-lg border border-line px-6 py-3 font-medium hover:border-brand">Início</Link>
      </div>
    </div>
  );
}
