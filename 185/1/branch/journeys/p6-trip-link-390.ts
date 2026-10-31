import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { tripLink } from "./pass.ts"
export default (j: Journey) => tripLink(j, { width: 390, height: 844 })
