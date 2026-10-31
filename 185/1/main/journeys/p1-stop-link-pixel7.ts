import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { stopLinkInFront } from "./pass.ts"
export default (j: Journey) => stopLinkInFront(j, undefined)
