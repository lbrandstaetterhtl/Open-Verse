import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // ── SPACING: Exaktes 8px-Grid ────────────────────────
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top':    'env(safe-area-inset-top)',
        'safe-left':   'env(safe-area-inset-left)',
        'safe-right':  'env(safe-area-inset-right)',
        'tab-bar':     '56px',
        'touch':       '44px',
        '0': '0px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
      },

      // ── TYPOGRAPHY: Mobile-First Scale ──────────────────
      fontSize: {
        'xs':   ['11px', { lineHeight: '14px', letterSpacing: '0.01em' }],
        'sm':   ['13px', { lineHeight: '18px' }],
        'base': ['15px', { lineHeight: '20px' }],  // Mobile Base
        'md':   ['17px', { lineHeight: '22px' }],
        'lg':   ['20px', { lineHeight: '25px' }],
        'xl':   ['24px', { lineHeight: '30px' }],
        '2xl':  ['28px', { lineHeight: '34px' }],
        '3xl':  ['34px', { lineHeight: '40px' }],
      },

      // ── BORDER RADIUS ───────────────────────────────────
      borderRadius: {
        'xs':   '4px',    // Tags, Badges
        'sm':   '8px',    // Inputs, Buttons
        'md':   '12px',   // Cards
        'lg':   '16px',   // Modals, Bottom Sheets
        'xl':   '20px',   // Large Containers
        '2xl':  '24px',   // Floating Elements
        'full': '9999px', // Avatare, Pills
      },

      // ── SHADOWS: Depth System ───────────────────────────
      boxShadow: {
        'none':   'none',
        'xs':     '0 1px 2px rgba(0,0,0,0.04)',
        'sm':     '0 2px 8px rgba(0,0,0,0.08)',
        'md':     '0 4px 16px rgba(0,0,0,0.12)',
        'lg':     '0 8px 32px rgba(0,0,0,0.16)',
        'xl':     '0 16px 48px rgba(0,0,0,0.20)',
        'sm-dark': '0 2px 8px rgba(0,0,0,0.32)',
        'md-dark': '0 4px 16px rgba(0,0,0,0.48)',
      },

      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },

      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'like-pop': {
          '0%':   { transform: 'scale(1)' },
          '30%':  { transform: 'scale(1.4)' },
          '60%':  { transform: 'scale(0.85)' },
          '100%': { transform: 'scale(1)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'count-up': {
          '0%':   { transform: 'translateY(4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
      },
      animation: {
        'fade-up':   'fade-up 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'fade-in':   'fade-in 150ms ease-out',
        'slide-up':  'slide-up 350ms cubic-bezier(0.32, 0.72, 0, 1)',  // iOS Sheet
        'slide-down':'slide-down 200ms ease-out',
        'scale-in':  'scale-in 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'like-pop':  'like-pop 350ms cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'shimmer':   'shimmer 1.5s linear infinite',
        'count-up':  'count-up 200ms ease-out',
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        smooth: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
