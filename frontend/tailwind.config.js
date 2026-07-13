/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  /** Matches `themeBootstrap` / `useTheme` — `dark:` utilities follow app toggle, not OS media query. */
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      keyframes: {
        voiceBar: {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
        /** Honest indeterminate prep — position only, no fake % tied to time-as-progress. */
        prepIndeterminate: {
          "0%": { left: "-30%" },
          "100%": { left: "100%" },
        },
      },
      animation: {
        voiceBar: "voiceBar 0.85s ease-in-out infinite",
        prepIndeterminate: "prepIndeterminate 1.25s linear infinite",
      },
      boxShadow: {
        "warning-glow": "0 10px 25px -5px var(--warning-shadow)",
        "accent-glow": "0 10px 25px -5px var(--accent-shadow)",
      },
      colors: {
        // Surfaces (page / panels)
        "bg-primary": "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-card": "var(--bg-card)",
        // Body text (flat key avoids clashing with text-* utilities naming)
        "text-primary": "var(--text-primary)",
        muted: "var(--text-muted)",
        // Neutrals
        border: {
          DEFAULT: "var(--border)",
          soft: "var(--border-soft)",
          mid: "var(--border-mid)",
          strong: "var(--border-strong)",
        },
        "hover-overlay": "var(--hover-overlay)",
        "hover-strong": "var(--hover-overlay-strong)",
        "surface-subtle": "var(--surface-subtle)",
        "overlay-scrim": "var(--overlay-scrim)",
        "overlay-scrim-medium": "var(--overlay-scrim-medium)",
        "overlay-scrim-light": "var(--overlay-scrim-light)",
        brand: {
          primary: "var(--color-brand-primary)",
          secondary: "var(--color-brand-secondary)",
          tertiary: "var(--color-brand-tertiary)",
        },
        button: {
          primary: "var(--button-primary)",
          hover: "var(--button-primary-hover)",
        },
        /** Welcome wizard — surfaces derived from theme (see index.css) */
        "welcome-overlay": "var(--welcome-setup-overlay)",
        "welcome-hint": "var(--welcome-setup-hint)",
        // Brand — nested so bg-accent-soft, border-accent-line, etc. resolve to real CSS
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          light: "var(--accent-light)",
          soft: "var(--accent-soft)",
          faint: "var(--accent-faint)",
          muted: "var(--accent-muted)",
          strong: "var(--accent-strong)",
          line: "var(--accent-line)",
          "line-strong": "var(--accent-line-strong)",
        },
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)",
          faint: "var(--success-faint)",
          strong: "var(--success-strong)",
          line: "var(--success-line)",
          bold: "var(--success-bold)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
          faint: "var(--warning-faint)",
          strong: "var(--warning-strong)",
          line: "var(--warning-line)",
          bold: "var(--warning-bold)",
        },
        error: {
          DEFAULT: "var(--error)",
          soft: "var(--error-soft)",
          faint: "var(--error-faint)",
          strong: "var(--error-strong)",
          line: "var(--error-line)",
          bold: "var(--error-bold)",
          hover: "var(--error-hover)",
        },
        info: {
          DEFAULT: "var(--info)",
          soft: "var(--info-soft)",
          line: "var(--info-line)",
          bold: "var(--info-bold)",
        },
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "1.4" }],
        "3xs": ["9px", { lineHeight: "1.4" }],
      },
    },
  },
  plugins: [],
};
