import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { standingLink } from "./pass.ts"
export default (j: Journey) => standingLink(j, undefined)
