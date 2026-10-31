import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { motion } from './motion-lib.ts'

// Regression, moving-map map-3d (spec #148 story 38): with prefers-reduced-motion, Shift + Right,
// the compass, the 3D toggle and Centre the map jump (no in-between needle angles, the tilt in a frame or two),
// and three quick Shift + Up still settle at 30.
export default (j: Journey) => motion(j, true, 'reduced-motion')
