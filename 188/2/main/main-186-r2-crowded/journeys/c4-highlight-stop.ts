import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { highlightThenStop } from "./extra.ts"
export default (j: Journey) => highlightThenStop(j)
