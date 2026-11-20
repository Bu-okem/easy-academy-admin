import type { Config } from 'tailwindcss'

// Tokens mirror docs/DESIGN.md section 1-3. That document is the source of
// truth; change it there first, then reflect the change here.
export default <Partial<Config>>{
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#1B2A33',
          active: '#2B3543',
          muted: '#8D97A6',
        },
        page: '#F4F3EF',
        surface: '#FFFFFF',
        hairline: '#E6E1D6',
        ink: {
          DEFAULT: '#1A1A1A',
          secondary: '#6E7280',
          disabled: '#A8ABB3',
        },
        brass: {
          DEFAULT: '#B8915C',
          dark: '#8C6A3D',
          tint: '#F3E6D4',
        },
        positive: {
          bg: '#DCE8D5',
          text: '#3F6B36',
        },
        negative: {
          bg: '#F5DCD4',
          text: '#B5573A',
        },
        info: {
          bg: '#DCE5F0',
          text: '#3B5A80',
        },
        // Late / Draft status pill (DESIGN.md 5.6) and the neutral delta badge.
        caution: {
          bg: '#F2E7CE',
          text: '#8C6A3D',
        },
        neutral: {
          bg: '#EDEBE4',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // role: [size, { lineHeight }] - DESIGN.md section 2
        wordmark: ['20px', { lineHeight: '28px' }],
        greeting: ['28px', { lineHeight: '36px' }],
        section: ['18px', { lineHeight: '26px' }],
        stat: ['32px', { lineHeight: '38px' }],
        'stat-sm': ['24px', { lineHeight: '30px' }],
        body: ['14px', { lineHeight: '20px' }],
        caption: ['13px', { lineHeight: '18px' }],
        badge: ['12px', { lineHeight: '16px' }],
        nav: ['14px', { lineHeight: '22px' }],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,20,20,0.03), 0 4px 12px rgba(20,20,20,0.04)',
        modal: '0 8px 24px rgba(20,20,20,0.12)',
        dropdown: '0 4px 16px rgba(20,20,20,0.08)',
      },
      spacing: {
        sidebar: '240px',
      },
    },
  },
}
