import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { arrivalsLinkInFront } from "./pass.ts"
export default (j: Journey) => arrivalsLinkInFront(j, undefined)
