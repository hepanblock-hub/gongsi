export const DESIGN_TOKENS = {
  colors: {
    bg: '#f8fafc',
    surface: '#ffffff',
    text: '#0f172a',
    mutedText: '#475569',
    border: '#e2e8f0',
    primary: '#1e3a8a',
    primaryHover: '#1d4ed8',
    success: '#15803d',
    warning: '#b45309',
    danger: '#b91c1c',
    neutral: '#64748b',
  },
  radius: {
    lg: '12px',
    xl: '16px',
  },
  shadow: {
    sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
    md: '0 4px 12px rgba(15, 23, 42, 0.08)',
  },
  spacing: {
    sectionGap: '2rem',
    cardPadding: '1.25rem',
  },
} as const;
