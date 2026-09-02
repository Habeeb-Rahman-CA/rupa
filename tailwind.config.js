/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--app-canvas)',
        surface: 'var(--app-surface)',
        ink: 'var(--app-ink)',
        'ink-muted': 'var(--app-ink-muted)',
        'ink-subtle': 'var(--app-ink-subtle)',
        accent: 'var(--app-accent)',
        positive: 'var(--app-positive)',
        negative: 'var(--app-negative)',
        hairline: 'var(--app-hairline)',
      },
      borderRadius: {
        sm: 'var(--app-radius-sm)',
        md: 'var(--app-radius-md)',
        lg: 'var(--app-radius-lg)',
        xl: 'var(--app-radius-xl)',
      },
      boxShadow: {
        card: 'var(--app-shadow-md)',
        'card-sm': 'var(--app-shadow-sm)',
        'card-lg': 'var(--app-shadow-lg)',
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
