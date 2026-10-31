import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { noneLink } from "./pass.ts"
export default (j: Journey) => noneLink(j, undefined)
