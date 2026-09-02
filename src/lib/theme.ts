/**
 * Single source of truth for the palette. Tailwind classes cover most of the UI,
 * but navigation and native components need raw values.
 */
export const theme = {
  bg: '#0f1115',
  surface: '#1a1d24',
  surfaceAlt: '#22262f',
  line: '#272b34',
  text: '#f4f5f7',
  textDim: '#9aa1ad',
  textFaint: '#6b7280',
  accent: '#4ade80',
  accentDim: '#22c55e',
  danger: '#f87171',
  protein: '#60a5fa',
  carbs: '#fbbf24',
  fat: '#f472b6',
} as const;
