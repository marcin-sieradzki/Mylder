// Pass rule: København Syd St. (arrivals); after the first answer, the board's route aborts: the source line says "may be out of date" within ~90 s of the answer's time.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { block } from './block.ts'
const run = process.argv[2]
export default (j: Journey) => block('arrivals', 'abort', run, `.verify/${run}/pr-fail-arrivals-abort/source.log`)(j)
