import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { crowdedLink } from "./pass.ts"
export default (j: Journey) => crowdedLink(j, undefined)
