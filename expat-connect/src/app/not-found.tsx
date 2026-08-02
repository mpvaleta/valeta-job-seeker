import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold text-ink">Página não encontrada</h1>
      <p className="mt-3 text-ink/60">O profissional ou página que você procura pode ter sido movido ou não existe mais.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark">Voltar ao início</Link>
    </div>
  );
}
