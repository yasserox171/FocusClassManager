/**
 * The centre lives in one timezone, and everybody reading a schedule means
 * "the clock on the wall in Safi" - never the clock of whatever laptop they
 * happen to open the app on. Every instant coming from the API is therefore
 * shifted to the centre's wall clock before being displayed, so a course
 * booked at 08:00 reads 08:00 for a user travelling abroad too.
 */

export const CENTER_TIMEZONE = import.meta.env.VITE_TIMEZONE ?? 'Africa/Casablanca'

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: CENTER_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/**
 * Returns a Date whose *local* fields carry the centre's wall clock for the
 * given instant. The result is only meant for display and for feeding the
 * calendar grid - never send it back to the API as an instant.
 */
export function toCenterWallClock(value: string | Date): Date {
  const instant = typeof value === 'string' ? new Date(value) : value
  const parts = PARTS_FORMATTER.formatToParts(instant)
  const lookup = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return new Date(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour') % 24,
    lookup('minute'),
    lookup('second'),
  )
}

/** Today's date in the centre's timezone, as a wall-clock Date. */
export function centerToday(): Date {
  return toCenterWallClock(new Date())
}
