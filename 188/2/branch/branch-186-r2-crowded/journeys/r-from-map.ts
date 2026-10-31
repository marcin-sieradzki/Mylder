import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { fromMap } from "./reg.ts"
export default (j: Journey) => fromMap(j)
