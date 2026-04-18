import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          muted: 'rgb(var(--surface-muted) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
          dim: 'rgb(var(--fg-dim) / <alpha-value>)',
          inverse: 'rgb(var(--fg-inverse) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
        },
        status: {
          running: 'rgb(var(--status-running) / <alpha-value>)',
          stopped: 'rgb(var(--status-stopped) / <alpha-value>)',
          error: 'rgb(var(--status-error) / <alpha-value>)',
          starting: 'rgb(var(--status-starting) / <alpha-value>)',
        },
        cat: {
          frontend: 'rgb(var(--cat-frontend) / <alpha-value>)',
          backend: 'rgb(var(--cat-backend) / <alpha-value>)',
          database: 'rgb(var(--cat-database) / <alpha-value>)',
          infra: 'rgb(var(--cat-infra) / <alpha-value>)',
          worker: 'rgb(var(--cat-worker) / <alpha-value>)',
          tooling: 'rgb(var(--cat-tooling) / <alpha-value>)',
          other: 'rgb(var(--cat-other) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          '"Fira Code"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
