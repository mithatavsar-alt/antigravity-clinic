/**
 * Design Tokens — Single Source of Truth
 *
 * Every color, spacing, radius, shadow, typography, and motion value
 * used across the Antigravity Clinic UI is defined here.
 *
 * RULES:
 * - Components consume these tokens, never raw hex values.
 * - CSS variables in globals.css mirror these tokens for theme switching.
 * - Tailwind config extends from these tokens.
 * - Dark areas = "impact zones" (~40%), Light areas = "comfort zones" (~60%).
 */

// ─── Color System ──────────────────────────────────────────────

export const colors = {
  // ── Light surfaces ──
  light: {
    /** Page base — warm off-white */
    bg: '#FAF6F1',
    /** Slightly deeper — alternating sections */
    bgSoft: '#F5F0E8',
    /** Elevated surface — modals, popovers */
    bgElevated: '#FFFEF9',
    /** Card backgrounds */
    card: '#FFFFFF',
    /** Glass light surface */
    glass: 'rgba(255, 254, 249, 0.72)',
    glassStrong: 'rgba(255, 254, 249, 0.88)',
  },

  // ── Dark surfaces ──
  dark: {
    /** Page base — deep charcoal, refined & rich */
    bg: '#0B0F14',
    /** Slightly lighter dark — section alternation */
    bgSoft: '#0E1218',
    /** Elevated dark — panels, cards */
    bgElevated: '#11161C',
    /** Card surface — subtle lift from bg */
    card: '#141A22',
    /** Glass dark surface */
    glass: 'rgba(11, 15, 20, 0.82)',
    glassStrong: 'rgba(14, 18, 24, 0.90)',
    /** Panel/overlay dark */
    panel: '#161C26',
    panelSoft: '#1E2530',
  },

  // ── Text ──
  text: {
    /** Primary text on light bg */
    primary: '#1A1A2E',
    /** Secondary text on light bg */
    secondary: 'rgba(26, 26, 46, 0.65)',
    /** Muted/caption on light bg */
    muted: 'rgba(26, 26, 46, 0.40)',
    /** Primary text on dark bg — slightly warmer white */
    inverse: '#EDEAE6',
    /** Secondary text on dark bg */
    inverseSoft: 'rgba(237, 234, 230, 0.55)',
    /** Muted text on dark bg */
    inverseMuted: 'rgba(237, 234, 230, 0.35)',
    /** Gold accent text */
    gold: '#C4A35A',
    /** Dark-theme gold (warmer) */
    goldWarm: '#D6B98C',
    /** Success/positive text (soft) */
    success: '#3D7A5F',
    /** Warning text (soft) */
    warning: '#C4883A',
  },

  // ── Brand / Accent ──
  brand: {
    /** Muted champagne gold — primary brand */
    gold: '#C4A35A',
    /** Lighter gold — hover, soft states */
    goldLight: '#D4B96A',
    /** Warm gold — dark theme accent */
    goldWarm: '#D6B98C',
    /** Gold glow (for shadows/glows) */
    goldGlow: 'rgba(196, 163, 90, 0.25)',
    /** Gold subtle (for borders, dividers) */
    goldSoft: 'rgba(196, 163, 90, 0.15)',
    /** Clinic green — trust, CTA support only */
    teal: '#2D5F5D',
    /** Teal for gradients */
    tealLight: '#3A7F6A',
    /** Emerald — dark theme success accent */
    emerald: '#3D9B7A',
    /** Purple — AI association, subtle accent */
    purple: '#8B7FA8',
    purpleSoft: '#A89BC4',
    /** Electric blue — modern SaaS accent */
    blue: '#5B8DEF',
    blueLight: '#7AA4F7',
    blueSoft: 'rgba(91, 141, 239, 0.15)',
    blueGlow: 'rgba(91, 141, 239, 0.25)',
    /** Violet — premium AI glow */
    violet: '#8B6CC1',
    violetSoft: 'rgba(139, 108, 193, 0.15)',
    violetGlow: 'rgba(139, 108, 193, 0.20)',
  },

  // ── Borders ──
  border: {
    /** Light theme subtle border */
    soft: 'rgba(26, 26, 46, 0.06)',
    /** Light theme visible border */
    medium: 'rgba(26, 26, 46, 0.12)',
    /** Dark theme subtle border */
    darkSoft: 'rgba(237, 234, 230, 0.06)',
    /** Dark theme visible border */
    darkMedium: 'rgba(237, 234, 230, 0.10)',
    /** Gold accent border */
    gold: 'rgba(196, 163, 90, 0.15)',
    goldStrong: 'rgba(196, 163, 90, 0.30)',
    /** Blue accent border (dark theme) */
    blue: 'rgba(91, 141, 239, 0.12)',
    blueStrong: 'rgba(91, 141, 239, 0.25)',
  },

  // ── Semantic states ──
  state: {
    success: '#3D7A5F',
    successSoft: 'rgba(61, 122, 95, 0.10)',
    warning: '#C4883A',
    warningSoft: 'rgba(196, 136, 58, 0.10)',
    error: '#A05252',
    errorSoft: 'rgba(160, 82, 82, 0.10)',
    info: '#5B8DEF',
    infoSoft: 'rgba(91, 141, 239, 0.10)',
  },

  // ── Stone scale (neutral grays) ──
  stone: {
    50: '#FAFAF9',
    100: '#F5F5F4',
    200: '#E7E5E4',
    300: '#D6D3D1',
    400: '#A8A29E',
    500: '#78716C',
  },
} as const

// ─── Typography ────────────────────────────────────────────────

export const typography = {
  /** Cormorant Garamond — editorial, luxurious */
  fontDisplay: 'var(--font-display)',
  /** Outfit — clean, modern, high readability */
  fontBody: 'var(--font-body)',
  /** JetBrains Mono — data, scores */
  fontMono: 'var(--font-mono)',

  size: {
    /** Hero headline: clamp(44px, 5.5vw, 76px) */
    hero: 'clamp(2.75rem, 5.5vw, 4.75rem)',
    /** Section H2: clamp(34px, 4.5vw, 58px) */
    h1: 'clamp(2.125rem, 4.5vw, 3.625rem)',
    /** Sub-section heading: clamp(26px, 3vw, 38px) */
    h2: 'clamp(1.625rem, 3vw, 2.375rem)',
    /** Card/panel title */
    h3: '1.5rem',     // 24px (was 22px)
    /** Large body — section descriptions */
    bodyLg: '1.125rem', // 18px (was 17px)
    /** Default body */
    body: '1rem',       // 16px (was 15px)
    /** Small body — captions, secondary */
    bodySm: '0.875rem', // 14px
    /** Micro text — badges, labels */
    micro: '0.75rem',   // 12px (was 11px)
    /** Tiny — score labels, metadata */
    tiny: '0.625rem',   // 10px (was 9px)
  },

  leading: {
    /** Tight — hero headlines */
    tight: '1.08',
    /** Snug — section headings */
    snug: '1.20',
    /** Normal — card titles */
    normal: '1.40',
    /** Relaxed — body text */
    relaxed: '1.75',
    /** Loose — long form reading */
    loose: '1.85',
  },

  tracking: {
    /** Headlines — slightly tighter */
    tight: '-0.02em',
    /** Normal body */
    normal: '0',
    /** Micro labels, overlines */
    wide: '0.12em',
    /** Section labels — widest */
    widest: '0.18em',
  },

  weight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const

// ─── Spacing (8px base grid) ──────────────────────────────────

export const spacing = {
  /** 4px */
  xs: '0.25rem',
  /** 8px */
  sm: '0.5rem',
  /** 12px */
  md: '0.75rem',
  /** 16px */
  lg: '1rem',
  /** 24px */
  xl: '1.5rem',
  /** 32px */
  '2xl': '2rem',
  /** 40px */
  '3xl': '2.5rem',
  /** 48px */
  '4xl': '3rem',
  /** 64px */
  '5xl': '4rem',
  /** 80px */
  '6xl': '5rem',
  /** 112px */
  '7xl': '7rem',

  /** Section vertical padding — mobile */
  sectionY: '5rem',       // 80px  = py-20
  /** Section vertical padding — desktop */
  sectionYLg: '7rem',     // 112px = py-28
  /** Section horizontal padding — mobile */
  sectionX: '1.5rem',     // 24px  = px-6
  /** Section horizontal padding — desktop */
  sectionXLg: '2.5rem',   // 40px  = px-10

  /** Container max-width */
  containerMax: '1400px',
} as const

// ─── Border Radius ─────────────────────────────────────────────

export const radius = {
  /** 8px — inputs, small elements */
  sm: '8px',
  /** 12px — buttons, badges */
  md: '12px',
  /** 16px — small cards, panels */
  lg: '16px',
  /** 20px — medium cards */
  xl: '20px',
  /** 24px — large cards, sections */
  '2xl': '24px',
  /** 28px — hero panels, CTA sections */
  '3xl': '28px',
  /** Full pill */
  full: '9999px',
} as const

// ─── Shadows ───────────────────────────────────────────────────

export const shadows = {
  /** Subtle card rest state */
  soft: '0 2px 16px rgba(26, 26, 46, 0.04)',
  /** Medium elevation */
  medium: '0 4px 24px rgba(26, 26, 46, 0.08)',
  /** Elevated panel/float */
  panel: '0 8px 32px rgba(26, 26, 46, 0.06)',
  /** Hover lift */
  hover: '0 16px 48px rgba(26, 26, 46, 0.10)',
  /** Maximum float */
  float: '0 20px 60px rgba(26, 26, 46, 0.08)',
  /** Gold glow — premium emphasis only */
  glowGold: '0 4px 20px rgba(196, 163, 90, 0.18)',
  /** Blue glow — modern accent */
  glowBlue: '0 4px 24px rgba(91, 141, 239, 0.20)',
  /** Violet glow — AI emphasis */
  glowViolet: '0 4px 24px rgba(139, 108, 193, 0.18)',
  /** Dark panel shadow — deeper, richer */
  dark: '0 8px 40px rgba(0, 0, 0, 0.40)',
  /** Dark hover */
  darkHover: '0 20px 60px rgba(0, 0, 0, 0.50)',
  /** Dark card — subtle ring + deep shadow */
  darkCard: '0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 40px rgba(0,0,0,0.35)',
  /** Subtle inner shadow for inputs */
  inner: 'inset 0 1px 2px rgba(26, 26, 46, 0.06)',
} as const

// ─── Glass / Blur ──────────────────────────────────────────────

export const glass = {
  light: {
    bg: colors.light.glass,
    bgStrong: colors.light.glassStrong,
    border: colors.border.gold,
    blur: '20px',
    shadow: shadows.panel,
    shadowHover: shadows.hover,
  },
  dark: {
    bg: colors.dark.glass,
    bgStrong: colors.dark.glassStrong,
    border: colors.border.darkSoft,
    blur: '24px',
    shadow: shadows.dark,
    shadowHover: shadows.darkHover,
  },
} as const

// ─── Motion ────────────────────────────────────────────────────

export const motion = {
  /** Standard easing — smooth deceleration */
  easing: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** Gentle ease — softer for subtle transitions */
  easingSoft: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],

  duration: {
    fast: 0.2,
    normal: 0.4,
    slow: 0.6,
    hero: 1.0,
  },

  staggerGap: 0.12,
} as const

// ─── Gradients ─────────────────────────────────────────────────

export const gradients = {
  /** Light hero background */
  heroLight: 'linear-gradient(160deg, #FAF6F1 0%, #F5EDE2 35%, #F0E6DA 65%, #EDE4DB 100%)',
  /** Dark premium background — deep charcoal with subtle blue undertone */
  heroDark: 'linear-gradient(160deg, #0B0F14 0%, #0E1319 20%, #101620 50%, #0B0F14 100%)',
  /** Gold accent */
  gold: 'linear-gradient(135deg, #C4A35A 0%, #D4B96A 50%, #C4A35A 100%)',
  /** Teal CTA */
  teal: 'linear-gradient(135deg, #2D5F5D 0%, #3A7F6A 100%)',
  /** Dark CTA panel — richer with subtle blue undertone */
  ctaDark: 'linear-gradient(135deg, #111620 0%, #161C28 50%, #111620 100%)',
  /** Blue-violet accent gradient */
  accent: 'linear-gradient(135deg, #5B8DEF 0%, #8B6CC1 100%)',
  /** Subtle ambient glow (for backgrounds) */
  ambientGlow: 'radial-gradient(ellipse at 50% 0%, rgba(91,141,239,0.06) 0%, transparent 70%)',
  /** Platinum subtle */
  platinum: 'linear-gradient(135deg, #E8E4EF 0%, #D4C4E8 50%, #C4B8D8 100%)',
  /** Portrait warm */
  portrait: 'linear-gradient(160deg, #F5E6D3 0%, #F0DDD5 40%, #E8E4EF 100%)',
} as const

// ─── Section Theme Presets ─────────────────────────────────────

export type SectionTheme =
  | 'hero-dark'
  | 'content-light'
  | 'content-light-alt'
  | 'panel-dark'
  | 'cta-dark'
  | 'form-light'
  | 'results-dark'

export const sectionThemes: Record<SectionTheme, {
  bg: string
  text: string
  textSecondary: string
  textMuted: string
  labelColor: string
  headingColor: string
  border: string
  isDark: boolean
}> = {
  'hero-dark': {
    bg: gradients.heroDark,
    text: colors.text.inverse,
    textSecondary: colors.text.inverseSoft,
    textMuted: colors.text.inverseMuted,
    labelColor: colors.brand.goldWarm,
    headingColor: colors.text.inverse,
    border: colors.border.darkSoft,
    isDark: true,
  },
  'content-light': {
    bg: colors.light.bg,
    text: colors.text.primary,
    textSecondary: colors.text.secondary,
    textMuted: colors.text.muted,
    labelColor: colors.brand.gold,
    headingColor: colors.text.primary,
    border: colors.border.soft,
    isDark: false,
  },
  'content-light-alt': {
    bg: colors.light.bgSoft,
    text: colors.text.primary,
    textSecondary: colors.text.secondary,
    textMuted: colors.text.muted,
    labelColor: colors.brand.gold,
    headingColor: colors.text.primary,
    border: colors.border.soft,
    isDark: false,
  },
  'panel-dark': {
    bg: colors.dark.bgSoft,
    text: colors.text.inverse,
    textSecondary: colors.text.inverseSoft,
    textMuted: colors.text.inverseMuted,
    labelColor: colors.brand.goldWarm,
    headingColor: colors.text.inverse,
    border: colors.border.darkSoft,
    isDark: true,
  },
  'cta-dark': {
    bg: gradients.ctaDark,
    text: colors.text.inverse,
    textSecondary: colors.text.inverseSoft,
    textMuted: colors.text.inverseMuted,
    labelColor: colors.brand.goldWarm,
    headingColor: colors.text.inverse,
    border: colors.border.darkSoft,
    isDark: true,
  },
  'form-light': {
    bg: colors.light.bgElevated,
    text: colors.text.primary,
    textSecondary: colors.text.secondary,
    textMuted: colors.text.muted,
    labelColor: colors.brand.gold,
    headingColor: colors.text.primary,
    border: colors.border.medium,
    isDark: false,
  },
  'results-dark': {
    bg: gradients.heroDark,
    text: colors.text.inverse,
    textSecondary: colors.text.inverseSoft,
    textMuted: colors.text.inverseMuted,
    labelColor: colors.brand.goldWarm,
    headingColor: colors.text.inverse,
    border: colors.border.darkSoft,
    isDark: true,
  },
} as const

// ─── Legacy compat export ──────────────────────────────────────
// Components that import `tokens` from this file will still work.
// Migrate them to use the named exports above over time.

export const tokens = {
  colors: {
    cream: colors.light.bg,
    ivory: colors.light.bgElevated,
    champagne: '#F5E6D3',
    nude: '#E8D5C4',
    warmBeige: '#D4C4B0',
    blush: '#F0DDD5',
    platinum: '#E8E4EF',
    accent: colors.dark.panel,
    softNavy: colors.dark.panelSoft,
    teal: colors.brand.teal,
    gold: colors.brand.gold,
    goldLight: colors.brand.goldLight,
    purple: colors.brand.purple,
    softPurple: colors.brand.purpleSoft,
    success: colors.state.success,
    warning: colors.state.warning,
    danger: colors.state.error,
    stone: colors.stone,
  },
  glass: glass.light,
  motion,
  radius,
  gradients,
} as const
