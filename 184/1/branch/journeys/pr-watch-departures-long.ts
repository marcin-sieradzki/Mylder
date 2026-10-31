// Pass rule: open København Syd St. (departures) by link on a fresh board, watch 5 minutes (second sample, WATCH_MIN=5): the source line never reads "may be out of date".
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { watch } from './watch.ts'
const run = process.argv[2]
export default (j: Journey) => watch('departures', run, `.verify/${run}/pr-watch-departures-long/source.log`)(j)
