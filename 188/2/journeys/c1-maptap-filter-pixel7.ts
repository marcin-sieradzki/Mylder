import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { mapTapFilter } from "./pass.ts"
export default (j: Journey) => mapTapFilter(j, undefined)
