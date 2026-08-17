import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { useAuth } from '../context/AuthContext'
import { colors, radius, spacing } from '../theme'
import { useDirection } from '../utils/direction'

/**
 * Top bar: brand on the leading edge, language switch and the account action on
 * the trailing edge. Browsing is anonymous, so the account action is "sign in"
 * until somebody actually signs in.
 */
export function HeaderBar({ onOpenLogin }: { onOpenLogin: () => void }) {
  const { t, i18n } = useTranslation()
  const { row } = useDirection()
  const { user, logout } = useAuth()

  const toggleLanguage = () => {
    void i18n.changeLanguage(i18n.language === 'ar' ? 'fr' : 'ar')
  }

  return (
    <View style={[styles.bar, row]}>
      <View style={[styles.brand, row]}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>F</Text>
        </View>
        <Text style={styles.brandText} numberOfLines={1}>
          {t('app.name')}
        </Text>
      </View>

      <View style={[styles.actions, row]}>
        <Pressable onPress={toggleLanguage} style={styles.chip} hitSlop={8}>
          <Text style={styles.chipText}>{i18n.language === 'ar' ? 'FR' : 'ع'}</Text>
        </Pressable>

        {user ? (
          <Pressable onPress={() => void logout()} style={styles.chip} hitSlop={8}>
            <Text style={styles.chipText} numberOfLines={1}>
              {t('nav.logout')}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={onOpenLogin} style={[styles.chip, styles.chipPrimary]} hitSlop={8}>
            <Text style={[styles.chipText, styles.chipPrimaryText]} numberOfLines={1}>
              {t('auth.signIn')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  brand: { alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  brandText: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  actions: { alignItems: 'center', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    minWidth: 40,
    alignItems: 'center',
  },
  chipPrimary: { backgroundColor: colors.brandSoft },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chipPrimaryText: { color: colors.brand },
})
