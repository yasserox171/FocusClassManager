import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'

import { colors, radius, spacing } from '../theme'
import { useDirection } from '../utils/direction'

/**
 * Every chart here plots a SINGLE series of magnitudes, so they all use one hue
 * and carry no legend - the section title names the measure. Grid and axes stay
 * recessive; values are labelled directly and selectively rather than on a
 * second axis.
 */

export interface Datum {
  label: string
  value: number
  /** Optional identity colour (a room's own colour), shown as a dot - never as the bar fill. */
  accent?: string
  /** Pre-formatted value; falls back to the raw number. */
  display?: string
}

/* -- horizontal bars ----------------------------------------------------- */

export function BarList({ data, max }: { data: Datum[]; max?: number }) {
  const { row, text, textEnd, isRTL } = useDirection()
  const ceiling = max ?? Math.max(...data.map((d) => d.value), 1)

  return (
    <View style={styles.barList}>
      {data.map((datum) => {
        const ratio = ceiling > 0 ? Math.max(datum.value / ceiling, 0) : 0
        return (
          <View key={datum.label} style={styles.barRow}>
            <View style={[styles.barHead, row]}>
              <View style={[styles.barLabelBox, row]}>
                {datum.accent ? (
                  <View style={[styles.accentDot, { backgroundColor: datum.accent }]} />
                ) : null}
                <Text style={[styles.barLabel, text]} numberOfLines={1}>
                  {datum.label}
                </Text>
              </View>
              <Text style={[styles.barValue, textEnd]}>{datum.display ?? datum.value}</Text>
            </View>

            {/* Track is recessive; the fill is the only saturated element. */}
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(ratio * 100, 100)}%`,
                    alignSelf: isRTL ? 'flex-end' : 'flex-start',
                    borderTopLeftRadius: isRTL ? 4 : 0,
                    borderBottomLeftRadius: isRTL ? 4 : 0,
                    borderTopRightRadius: isRTL ? 0 : 4,
                    borderBottomRightRadius: isRTL ? 0 : 4,
                  },
                ]}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}

/* -- vertical columns ---------------------------------------------------- */

export function ColumnChart({ data, height = 160 }: { data: Datum[]; height?: number }) {
  const [width, setWidth] = useState(0)
  const max = Math.max(...data.map((d) => d.value), 1)

  const padBottom = 22
  const plotHeight = height - padBottom
  // A 2px surface gap between adjacent bars keeps them from reading as one mass.
  const gap = 2
  const slot = data.length ? width / data.length : 0
  const barWidth = Math.max(slot - gap, 1)

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {/* recessive baseline */}
          <Line x1={0} y1={plotHeight} x2={width} y2={plotHeight} stroke={colors.grid} strokeWidth={1} />
          {data.map((datum, index) => {
            const barHeight = Math.max((datum.value / max) * (plotHeight - 4), datum.value > 0 ? 2 : 0)
            const x = index * slot + gap / 2
            return (
              <Rect
                key={datum.label}
                x={x}
                y={plotHeight - barHeight}
                width={barWidth}
                height={barHeight}
                rx={barHeight > 4 ? 4 : 0}
                fill={colors.bar}
              />
            )
          })}
        </Svg>
      )}
      <View style={styles.columnLabels} pointerEvents="none">
        {data.map((datum, index) => (
          <Text
            key={datum.label}
            style={[
              styles.columnLabel,
              { width: slot || undefined },
              // Label every other tick when the axis gets crowded.
              data.length > 8 && index % 2 === 1 ? styles.hidden : null,
            ]}
            numberOfLines={1}
          >
            {datum.label}
          </Text>
        ))}
      </View>
    </View>
  )
}

/* -- line over time ------------------------------------------------------ */

export function LineChart({ data, height = 180 }: { data: Datum[]; height?: number }) {
  const [width, setWidth] = useState(0)
  const max = Math.max(...data.map((d) => d.value), 1)

  const padBottom = 22
  const padTop = 10
  const plotHeight = height - padBottom - padTop
  const step = data.length > 1 ? width / (data.length - 1) : 0

  const point = (datum: Datum, index: number) => ({
    x: data.length > 1 ? index * step : width / 2,
    y: padTop + plotHeight - (datum.value / max) * plotHeight,
  })

  const path = data.map((d, i) => {
    const { x, y } = point(d, i)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const peakIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && data.length > 0 && (
        <Svg width={width} height={height}>
          {/* two recessive gridlines, no boxed frame */}
          {[0.5, 1].map((fraction) => (
            <Line
              key={fraction}
              x1={0}
              y1={padTop + plotHeight * fraction}
              x2={width}
              y2={padTop + plotHeight * fraction}
              stroke={colors.grid}
              strokeWidth={1}
            />
          ))}
          <Path d={path} stroke={colors.bar} strokeWidth={2} fill="none" strokeLinejoin="round" />
          {data.map((datum, index) => {
            const { x, y } = point(datum, index)
            const isEdge = index === 0 || index === data.length - 1 || index === peakIndex
            if (!isEdge) return null
            return (
              // 2px surface ring keeps the marker legible where it sits on the line
              <Circle key={datum.label} cx={x} cy={y} r={4} fill={colors.bar} stroke={colors.surface} strokeWidth={2} />
            )
          })}
        </Svg>
      )}
      {/*
        Points sit at 0 .. width, so fixed-width label slots would overflow at
        both ends. Sharing the row and anchoring the outer labels inwards keeps
        every tick inside the plot.
      */}
      <View style={styles.columnLabels} pointerEvents="none">
        {data.map((datum, index) => (
          <Text
            key={datum.label}
            style={[
              styles.columnLabel,
              styles.lineLabel,
              index === 0 ? styles.alignStart : index === data.length - 1 ? styles.alignEnd : null,
              data.length > 6 && index % 2 === 1 ? styles.hidden : null,
            ]}
            numberOfLines={1}
          >
            {datum.label}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  barList: { gap: spacing.md },
  barRow: { gap: 5 },
  barHead: { justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  barLabelBox: { alignItems: 'center', gap: 6, flex: 1 },
  accentDot: { width: 8, height: 8, borderRadius: 4 },
  barLabel: { fontSize: 13, color: colors.text, flex: 1 },
  barValue: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  barTrack: { height: 8, backgroundColor: colors.bg, borderRadius: radius.sm, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.bar },

  columnLabels: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  columnLabel: { fontSize: 10, color: colors.textFaint, textAlign: 'center' },
  lineLabel: { flex: 1 },
  alignStart: { textAlign: 'left' },
  alignEnd: { textAlign: 'right' },
  hidden: { opacity: 0 },
})
