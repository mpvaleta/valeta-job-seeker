// Sits next to the wordmark in the header (always on-screen, since the header
// is sticky) so anyone shown a link — or a screenshot — immediately knows
// this is a work in progress, not the live product.
export default function PrototypeBadge() {
  return (
    <span
      className="rounded-full border border-ink/15 bg-ink px-2.5 py-0.5 text-[10px] font-mono font-semibold tracking-wider text-paper"
      title="Versão de demonstração — ainda em desenvolvimento"
    >
      PROTÓTIPO
    </span>
  );
}
