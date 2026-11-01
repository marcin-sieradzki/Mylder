import type { Journey } from '/home/user/mylder-verify/214-branch/.claude/skills/verify-mylder/scripts/drive.ts'
import { stopCancelled } from '/home/user/mylder-verify/214-journeys/lib.ts'
export default (j: Journey) => stopCancelled(j, 'en')
