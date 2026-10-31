import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { arrivalsMetro } from "./reg.ts"
export default (j: Journey) => arrivalsMetro(j)
