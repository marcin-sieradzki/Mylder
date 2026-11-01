import type { Journey } from '/home/user/mylder-verify/214-branch/.claude/skills/verify-mylder/scripts/drive.ts'
import { stopDelays } from '/home/user/mylder-verify/214-journeys/lib.ts'
export default (j: Journey) => stopDelays(j, 'da')
