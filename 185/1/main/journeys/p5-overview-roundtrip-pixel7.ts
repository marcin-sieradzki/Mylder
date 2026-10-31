import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { overviewRoundtrip } from "./pass.ts"
export default (j: Journey) => overviewRoundtrip(j, undefined)
