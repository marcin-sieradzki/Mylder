import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { noArrivals } from "./reg.ts"
export default (j: Journey) => noArrivals(j)
