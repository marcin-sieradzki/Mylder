import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { motion } from './motion-lib.ts'

// Regression, moving-map map-3d: with full motion, Shift + Right, the compass, the 3D toggle and
// Centre the map still ease (the needle passes through in-between angles; the tilt takes frames).
export default (j: Journey) => motion(j, false, 'eases')
