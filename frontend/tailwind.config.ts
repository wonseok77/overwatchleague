import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'ow-orange': {
          400: '#FFBE5C',
          500: '#F99E1A',
          600: '#E08810',
        },
        'ow-blue': {
          400: '#72D4F5',
          500: '#4FC1E9',
          600: '#2EA8D0',
        },
        'ow-dark': {
          800: '#1A1F2E',
          900: '#13161E',
        },
        primary: {
          DEFAULT: '#F99E1A',
          foreground: '#FFFFFF',
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: '#F3F4F6',
          foreground: '#6B7280',
        },
        accent: {
          DEFAULT: '#F3F4F6',
          foreground: '#1A1F2E',
        },
        border: '#E5E7EB',
        input: '#E5E7EB',
        ring: '#F99E1A',
        background: '#FFFFFF',
        foreground: '#1A1F2E',
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#1A1F2E',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#1A1F2E',
        },
        // Role colors
        tank: '#4FC1E9',
        dps: '#F87171',
        support: '#4ADE80',
      },
      fontFamily: {
        sans: ['Pretendard', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [],
}

export default config
