import type { Mode } from '../../src/timetable/format.ts'

// Perron's transit colour tokens (`@mylder/perron`'s tokens.css): a token per Metro and S-tog
// line, and a colour per mode for every other line.

const LINE_TOKENS: Partial<Record<Mode, readonly string[]>> = {
  metro: ['M1', 'M2', 'M3', 'M4'],
  's-tog': ['A', 'B', 'C', 'E', 'F', 'H'],
}

const MODE_TOKENS: Record<Mode, string> = {
  bus: 'perron-color-transit-mode-bus',
  metro: 'perron-color-transit-mode-regional',
  's-tog': 'perron-color-transit-mode-regional',
  train: 'perron-color-transit-mode-regional',
  'light-rail': 'perron-color-transit-mode-regional',
}

/** The token a line is drawn in, and whether it fell back to its mode's colour. */
export function lineColour(mode: Mode, name: string): { colour: string; fallback: boolean } {
  if (LINE_TOKENS[mode]?.includes(name)) {
    return { colour: `perron-color-transit-line-${name.toLowerCase()}`, fallback: false }
  }
  return { colour: MODE_TOKENS[mode], fallback: true }
}
