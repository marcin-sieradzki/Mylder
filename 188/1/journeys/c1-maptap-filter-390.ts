import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { mapTapFilter } from "./pass.ts"
import { P390 } from "./peek.ts"
export default (j: Journey) => mapTapFilter(j, P390)
