/**
 * Server the app talks to.
 *
 * Override at build time without touching the code:
 *   EXPO_PUBLIC_API_URL=https://salles.centrefocus.ma/api npx expo run:android --variant release
 *
 * Keep the trailing `/api` - every endpoint is mounted under it.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://salles.centrefocus.ma/api'

/** Times are always shown at the centre's own clock, whatever the phone's zone. */
export const CENTER_TIMEZONE = 'Africa/Casablanca'

/** Opening hours, mirrors BUSINESS_HOURS_START / END on the server. */
export const BUSINESS_HOURS = { start: 8, end: 20 }
