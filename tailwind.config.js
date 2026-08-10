/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      // 全局基础字号上调：统一到 16-17px 母带级阅读体验
      // xs 12→14, sm 14→16, base 16→17, lg 18→19, xl 20→22, 2xl 24→26, 3xl 30→32
      fontSize: {
        xs:   ['14px', { lineHeight: '20px' }],
        sm:   ['16px', { lineHeight: '22px' }],
        base: ['17px', { lineHeight: '24px' }],
        lg:   ['19px', { lineHeight: '26px' }],
        xl:   ['22px', { lineHeight: '28px' }],
        '2xl':['26px', { lineHeight: '32px' }],
        '3xl':['32px', { lineHeight: '38px' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        cyan: {
          DEFAULT: 'hsl(var(--cyan))',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
