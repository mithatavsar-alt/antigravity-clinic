import type { Config } from 'tailwindcss'

/**
 * Tailwind config — values mirror lib/design-tokens.ts.
 * Keep in sync: tokens file is the canonical source,
 * this config provides Tailwind utility class access.
 */

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      colors: {
        // ── Light surfaces ──
        cream: '#FAF6F1',
        ivory: '#FFFEF9',
        champagne: '#F5E6D3',
        nude: '#E8D5C4',
        warmBeige: '#D4C4B0',
        blush: '#F0DDD5',
        platinum: '#E8E4EF',
        // ── Neutrals ──
        stone: {
          '50': '#FAFAF9',
          '100': '#F5F5F4',
          '200': '#E7E5E4',
          '300': '#D6D3D1',
          '400': '#A8A29E',
          '500': '#78716C',
        },
        // ── Dark surfaces ──
        accent: '#1A1A2E',
        softNavy: '#2A2A4A',
        // ── Brand semantic ──
        medical: {
          trust: '#2D5F5D',
          gold: '#C4A35A',
          goldLight: '#D4B96A',
          success: '#3D7A5F',
          warning: '#C4883A',
          danger: '#A05252',
        },
        techAccent: {
          purple: '#8B7FA8',
          softPurple: '#A89BC4',
        },
        // ── Semantic surface tokens (CSS variable backed) ──
        surface: {
          light: 'var(--color-bg)',
          'light-alt': 'var(--color-bg-secondary)',
          elevated: 'var(--color-bg-elevated)',
        },
        txt: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'Georgia', 'serif'],
        body: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      fontSize: {
        'section-label': ['11px', { letterSpacing: '0.2em', fontWeight: '500' }],
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
      },
      boxShadow: {
        soft: '0 2px 16px rgba(26, 26, 46, 0.04)',
        medium: '0 4px 24px rgba(26, 26, 46, 0.08)',
        glass: '0 8px 32px rgba(26, 26, 46, 0.06)',
        'glass-hover': '0 16px 48px rgba(26, 26, 46, 0.10)',
        'glass-float': '0 20px 60px rgba(26, 26, 46, 0.08)',
        'gold-glow': '0 4px 20px rgba(196, 163, 90, 0.18)',
        dark: '0 8px 40px rgba(0, 0, 0, 0.30)',
        'dark-hover': '0 20px 60px rgba(0, 0, 0, 0.40)',
        inner: 'inset 0 1px 2px rgba(26, 26, 46, 0.06)',
      },
      backdropBlur: {
        glass: '20px',
        'glass-dark': '24px',
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #C4A35A 0%, #D4B96A 50%, #C4A35A 100%)',
        'gradient-teal': 'linear-gradient(135deg, #2D5F5D 0%, #3A7F6A 100%)',
        'gradient-platinum': 'linear-gradient(135deg, #E8E4EF 0%, #D4C4E8 50%, #C4B8D8 100%)',
        'gradient-hero': 'linear-gradient(160deg, #FAF6F1 0%, #F5E6D3 50%, #E8E4EF 100%)',
        'gradient-cta': 'linear-gradient(135deg, #1A1A2E 0%, #2A2A4A 100%)',
        'gradient-portrait': 'linear-gradient(160deg, #F5E6D3 0%, #F0DDD5 40%, #E8E4EF 100%)',
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards',
      },
      spacing: {
        section: '5rem',
        'section-lg': '7rem',
      },
      maxWidth: {
        container: '1400px',
      },
    },
  },
  plugins: [],
}

export default config
