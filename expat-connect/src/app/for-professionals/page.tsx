import Link from 'next/link';

export default function ForProfessionalsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-3xl font-semibold text-ink">Para profissionais</h1>
      <p className="mt-4 text-ink/70">
        Atende a comunidade brasileira no exterior? Cadastre seu perfil e seja
        encontrado por quem procura exatamente o que você oferece — no seu idioma.
      </p>
      <ul className="mt-6 space-y-3 text-ink/80 list-disc pl-5">
        <li>Perfil gratuito com seus serviços, credenciais e contato</li>
        <li>Selo de verificação após checagem de credenciais</li>
        <li>Avaliações reais de clientes da comunidade</li>
      </ul>
      <Link href="/register-professional"
        className="mt-8 inline-block rounded-lg bg-brand px-6 py-3 text-white font-medium hover:bg-brand-dark">
        Cadastrar meu perfil
      </Link>
      <p className="mt-3 text-sm text-ink/50">
        É preciso ter uma conta — <Link href="/signup" className="underline">crie a sua</Link> primeiro.
      </p>
    </div>
  );
}
