import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { parseApiError } from '../api/client'
import { Button, Title } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { colors, radius, spacing } from '../theme'
import { useDirection } from '../utils/direction'

export function LoginScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { t } = useTranslation()
  const { login } = useAuth()
  const { text, isRTL } = useDirection()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigation.goBack()
    } catch (caught) {
      const parsed = parseApiError(caught)
      setError(parsed.status === 401 ? t('auth.invalidCredentials') : t(parsed.detail))
    } finally {
      setBusy(false)
    }
  }

  const inputStyle = [styles.input, { textAlign: isRTL ? 'right' : 'left' } as const]

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoText}>F</Text>
        </View>

        <Title>{t('auth.welcome')}</Title>
        <Text style={[styles.subtitle, text]}>{t('auth.subtitle')}</Text>

        <View style={styles.field}>
          <Text style={[styles.label, text]}>{t('auth.username')}</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
            placeholderTextColor={colors.textFaint}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, text]}>{t('auth.password')}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            style={inputStyle}
            placeholderTextColor={colors.textFaint}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button
            label={busy ? t('auth.signingIn') : t('auth.signIn')}
            onPress={submit}
            loading={busy}
            disabled={!username || !password}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    alignSelf: 'center',
  },
  logoText: { color: '#ffffff', fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.lg },
  field: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    minHeight: 48,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: radius.sm,
    textAlign: 'center',
  },
  actions: { marginTop: spacing.lg },
})
