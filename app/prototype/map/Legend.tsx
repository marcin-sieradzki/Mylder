// The five states in words beside their shapes, in the current variant's treatment, so the
// map can be judged against its own legend. Always all five, in Perron's order.
import { lineColour, tokens, vehicleDot, type Theme } from './perron'
import type { Variant } from './glyphs'
import { STATES } from './sim'

const S = 20
const C = S / 2

function Shape({
  state,
  colour,
  grey,
  halo,
  r,
}: {
  state: number
  colour: string
  grey: string
  halo: string
  r: number
}) {
  const { ageing, estimated, timetable, noSignal } = vehicleDot
  switch (state) {
    case 0:
      return <circle cx={C} cy={C} r={r} fill={colour} />
    case 1:
      return (
        <>
          <circle cx={C} cy={C} r={r} fill={colour} opacity={ageing.fillOpacity} />
          <circle
            cx={C}
            cy={C}
            r={r - ageing.strokeInset}
            fill="none"
            stroke={colour}
            strokeWidth={ageing.strokeWidth}
          />
        </>
      )
    case 2:
      return (
        <circle
          cx={C}
          cy={C}
          r={r - estimated.strokeInset}
          fill="none"
          stroke={colour}
          strokeWidth={estimated.strokeWidth}
        />
      )
    case 3:
      return (
        <circle
          cx={C}
          cy={C}
          r={r - timetable.strokeInset}
          fill="none"
          stroke={colour}
          strokeWidth={timetable.strokeWidth}
          strokeDasharray={timetable.dash.join(' ')}
        />
      )
    default: {
      const d = r * 0.75
      return (
        <>
          <circle cx={C} cy={C} r={r} fill={grey} />
          <line
            x1={C - d}
            y1={C - d}
            x2={C + d}
            y2={C + d}
            stroke={halo}
            strokeWidth={noSignal.cutWidth}
          />
        </>
      )
    }
  }
}

export default function Legend({ variant, theme }: { variant: Variant; theme: Theme }) {
  const t = tokens(theme)
  const colour = lineColour('A', 'stog', theme)
  const grey = t['color.data-state.no-signal']
  const ink = t['color.text.primary']
  const halo = variant === 'c' ? t['color.surface.raised'] : t['color.data-state.halo']
  const r = variant === 'c' ? 7 : 5.5
  return (
    <ul className="proto-legend" aria-label="Data states">
      {STATES.map((name, i) => (
        <li key={name}>
          <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
            <circle cx={C} cy={C} r={r + 2} fill={halo} />
            {variant === 'b' ? (
              <>
                <circle
                  cx={C}
                  cy={C}
                  r={r + 1.2}
                  fill="none"
                  stroke={i === 4 ? grey : colour}
                  strokeWidth={1.3}
                />
                <Shape state={i} colour={ink} grey={grey} halo={halo} r={r - 1.6} />
              </>
            ) : (
              <Shape state={i} colour={colour} grey={grey} halo={halo} r={r} />
            )}
          </svg>
          <span>{name}</span>
        </li>
      ))}
    </ul>
  )
}
