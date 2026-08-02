export default function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink/60 flex flex-wrap gap-6 justify-between">
        <p>© {new Date().getFullYear()} Conecta. Conectando quem está longe de casa a quem entende a jornada.</p>
        <div className="flex gap-4">
          <a href="/terms" className="hover:text-ink">Termos</a>
          <a href="/privacy" className="hover:text-ink">Privacidade</a>
          <a href="/for-professionals" className="hover:text-ink">Para profissionais</a>
        </div>
      </div>
    </footer>
  );
}
