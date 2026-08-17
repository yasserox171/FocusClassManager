import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StatusBar } from 'expo-status-bar'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { HeaderBar } from './src/components/HeaderBar'
import { AuthProvider } from './src/context/AuthContext'
import './src/i18n'
import { AnalyticsScreen } from './src/screens/AnalyticsScreen'
import { BookingsScreen } from './src/screens/BookingsScreen'
import { DashboardScreen } from './src/screens/DashboardScreen'
import { EmployeesScreen } from './src/screens/EmployeesScreen'
import { LoginScreen } from './src/screens/LoginScreen'
import { RoomsScreen } from './src/screens/RoomsScreen'
import { colors } from './src/theme'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

/** Tiny glyphs keep the bundle free of an icon font while staying legible. */
const TAB_GLYPHS: Record<string, string> = {
  dashboard: '▦',
  bookings: '▤',
  rooms: '▣',
  employees: '☰',
  analytics: '▥',
}

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 17, color: focused ? colors.brand : colors.textFaint }}>
      {TAB_GLYPHS[name] ?? '•'}
    </Text>
  )
}

function Tabs({ navigation }: { navigation: { navigate: (route: string) => void } }) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.flex}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.surface }}>
        <HeaderBar onOpenLogin={() => navigation.navigate('Login')} />
      </View>

      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarIcon: ({ focused }) => <TabIcon name={route.name.toLowerCase()} focused={focused} />,
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: t('nav.dashboard') }}
        />
        <Tab.Screen
          name="Bookings"
          component={BookingsScreen}
          options={{ title: t('nav.bookings') }}
        />
        <Tab.Screen name="Rooms" component={RoomsScreen} options={{ title: t('nav.rooms') }} />
        <Tab.Screen
          name="Employees"
          component={EmployeesScreen}
          options={{ title: t('nav.employees') }}
        />
        <Tab.Screen
          name="Analytics"
          component={AnalyticsScreen}
          options={{ title: t('nav.analytics') }}
        />
      </Tab.Navigator>
    </View>
  )
}

export default function App() {
  const { t } = useTranslation()

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ title: t('auth.login'), presentation: 'modal' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
})
