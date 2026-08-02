import type { Metadata } from 'next';
import { Fraunces, Public_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// Display face: warmth and trust, used only for headlines — not the same
// sans-everywhere pairing every SaaS reaches for. Body: a civic-service
// typeface (fitting for a product about navigating a new country's
// bureaucracy). Mono: reserved for real numbers/data, so stats read as
// data rather than marketing copy.
const display = Fraunces({
  subsets: ['latin'], weight: ['500', '600', '700'], style: ['normal', 'italic'],
  variable: '--font-display'
});
const body = Public_Sans({
  subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body'
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['500', '600'], variable: '--font-mono'
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Conecta — Profissionais que falam a sua língua',
    template: '%s | Conecta'
  },
  description:
    'Encontre médicos, advogados, terapeutas e outros profissionais brasileiros ou que falam português, onde você estiver.',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Conecta',
    title: 'Conecta — Profissionais que falam a sua língua',
    description: 'Encontre profissionais brasileiros ou que falam português, perto de você ou online.'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen flex flex-col bg-paper text-ink antialiased font-sans">
        <a href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow">
          Pular para o conteúdo
        </a>
        <Header />
        <main id="main" className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
