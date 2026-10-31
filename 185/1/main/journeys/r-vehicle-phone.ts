import type { Journey } from "../../../.claude/skills/verify-mylder/scripts/drive.ts"
import { vehicleOpenClose } from "./reg.ts"
export default (j: Journey) => vehicleOpenClose(j)
