import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { missingAfterStanding } from "./r2.ts"
export default (j: Journey) => missingAfterStanding(j, undefined)
