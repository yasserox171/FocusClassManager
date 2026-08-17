import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { colors, radius, shadow, spacing, statusColor } from '../theme'
import { useDirection } from '../utils/direction'

/* -- text ---------------------------------------------------------------- */

export function Title({ children }: { children: ReactNode }) {
  const { text } = useDirection()
  return <Text style={[styles.title, text]}>{children}</Text>
}

export function Subtitle({ children }: { children: ReactNode }) {
  const { text } = useDirection()
  return <Text style={[styles.subtitle, text]}>{children}</Text>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { text } = useDirection()
  return <Text style={[styles.sectionTitle, text]}>{children}</Text>
}

/* -- containers ---------------------------------------------------------- */

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && styles.cardPressed]}
      >
        {children}
      </Pressable>
    )
  }
  return <View style={[styles.card, style]}>{children}</View>
}

/* -- badges -------------------------------------------------------------- */

export function Badge({ label, tone = 'info' }: { label: string; tone?: string }) {
  const palette = statusColor[tone] ?? statusColor.info
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/* -- buttons ------------------------------------------------------------- */

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  loading?: boolean
}) {
  const tone =
    variant === 'primary'
      ? { bg: colors.brand, fg: '#ffffff' }
      : variant === 'danger'
        ? { bg: colors.dangerSoft, fg: colors.danger }
        : { bg: colors.brandSoft, fg: colors.brand }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tone.bg, opacity: disabled || loading ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: tone.fg }]}>{label}</Text>
      )}
    </Pressable>
  )
}

/* -- states -------------------------------------------------------------- */

export function Loading() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.brand} />
    </View>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>{t('errors.network')}</Text>
      <View style={{ height: spacing.lg }} />
      <Button label={t('common.reset')} onPress={onRetry} variant="ghost" />
    </View>
  )
}

/* -- layout helpers ------------------------------------------------------ */

/** A label/value pair that follows the reading direction. */
export function Row({ label, value }: { label: string; value: string }) {
  const { row, text, textEnd } = useDirection()
  return (
    <View style={[styles.row, row]}>
      <Text style={[styles.rowLabel, text]}>{label}</Text>
      <Text style={[styles.rowValue, textEnd]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.7 },

  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12, fontWeight: '600' },

  button: {
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },

  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  errorTitle: { color: colors.danger, fontSize: 15, fontWeight: '600', textAlign: 'center' },

  row: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  rowLabel: { color: colors.textMuted, fontSize: 13, flexShrink: 0 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '500', flex: 1 },
})
