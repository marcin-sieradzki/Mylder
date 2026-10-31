import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { arrivals } from "./reg.ts"
export default (j: Journey) => arrivals(j)
