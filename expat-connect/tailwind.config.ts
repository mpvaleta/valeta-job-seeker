import type { Config } from 'tailwindcss';

// Design tokens for the "base" theme: United States (where the user is) +
// Brazil (where the professional is from). Colors are CSS variables
// (see globals.css) so a future per-country-pair theme can swap the values
// without touching a single component class. See docs/DESIGN.md.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--color-paper)',
        ink: 'var(--color-ink)',
        line: 'var(--color-line)',
        // "Where you are" — the US side of the match.
        atlantic: {
          DEFAULT: 'var(--color-atlantic)',
          soft: 'var(--color-atlantic-soft)'
        },
        // "Who you're looking for" — the Brazil side; also the primary CTA color.
        brand: {
          DEFAULT: 'var(--color-cerrado)',
          dark: 'var(--color-cerrado-dark)',
          light: 'var(--color-cerrado-soft)'
        },
        // The seam between the two — ratings, verified badges, highlights.
        gold: {
          DEFAULT: 'var(--color-ipe)',
          soft: 'var(--color-ipe-soft)'
        }
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-serif', 'serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace']
      },
      borderRadius: { xl2: '1.25rem' }
    }
  },
  plugins: []
};
export default config;
