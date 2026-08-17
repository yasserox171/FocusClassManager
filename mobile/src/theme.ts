/** Design tokens, aligned with the web app's Tailwind palette. */

export const colors = {
  brand: '#2563eb',
  brandDark: '#1d4ed8',
  brandSoft: '#eff6ff',

  bg: '#f1f5f9',
  surface: '#ffffff',
  border: '#e2e8f0',

  text: '#0f172a',
  textMuted: '#64748b',
  textFaint: '#94a3b8',

  success: '#16a34a',
  successSoft: '#dcfce7',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  info: '#0891b2',
  infoSoft: '#cffafe',

  /**
   * Categorical hues, assigned in this fixed order and never cycled.
   * Order is validated for colour-vision deficiency: worst adjacent pair is
   * ΔE 10.3 (deutan) / 27.2 (normal vision). Do not reorder without re-checking.
   */
  series: ['#2563eb', '#db2777', '#0891b2', '#d97706', '#7c3aed', '#16a34a'],

  /** Magnitude bars use one hue - grid and axes stay recessive behind them. */
  bar: '#2563eb',
  grid: '#e2e8f0',
} as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const

export const shadow = {
  card: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const

/** Status -> colour pair, used by room badges and booking chips alike. */
export const statusColor: Record<string, { fg: string; bg: string }> = {
  available: { fg: colors.success, bg: colors.successSoft },
  maintenance: { fg: colors.warning, bg: colors.warningSoft },
  closed: { fg: colors.danger, bg: colors.dangerSoft },
  confirmed: { fg: colors.success, bg: colors.successSoft },
  cancelled: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  critical: { fg: colors.danger, bg: colors.dangerSoft },
}
