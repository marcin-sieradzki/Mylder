// Pass rule 10: each Overview tab fits a phone, English.
import type { Journey } from '../../../.claude/skills/verify-mylder/scripts/drive.ts'
import { phone } from './phone.ts'
export default async (j: Journey) => phone(j, 'en')
