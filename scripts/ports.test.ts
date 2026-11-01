import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEMO_PORT, E2E_PORTS, factoryVerifierPorts, VERIFY_PORTS } from './ports.ts'

const read = (path: string) => readFileSync(path, 'utf8')

// Rounds past the factory's brakes, which stop a ticket after its third.
const ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

const fixed = [...Object.values(E2E_PORTS), DEMO_PORT, ...Object.values(VERIFY_PORTS)]
const verifier = ROUNDS.flatMap((round) => Object.values(factoryVerifierPorts(round)))

describe('ports', () => {
  it('gives every server a port no other takes, in any round of the factory', () => {
    const all = [...fixed, ...verifier]
    expect(new Set(all).size).toBe(all.length)
  })

  it('lists every port in the table in docs/testing-seams.md', () => {
    const rows = read('docs/testing-seams.md')
      .split('\n')
      .filter((line) => line.startsWith('| '))
      .map((line) => line.split('|')[1]!.trim())
    for (const port of fixed) expect(rows).toContain(String(port))
    expect(rows).toEqual(expect.arrayContaining(['4300 + 2r', '4301 + 2r', '4400 + r']))
  })

  it('agrees with the factory skill and the verifier launch script', () => {
    const base = factoryVerifierPorts(0)
    expect(factoryVerifierPorts(1)).toEqual({
      main: base.main + 2,
      branch: base.branch + 2,
      otherRecording: base.otherRecording + 1,
    })
    expect(read('.claude/skills/factory/SKILL.md')).toContain(
      `ports <${base.main} + 2r> and <${base.branch} + 2r>, and <${base.otherRecording} + r>`,
    )
    expect(read('.claude/skills/verify-mylder/scripts/launch.sh')).toContain(
      `port=\${2:-${VERIFY_PORTS.branch}}`,
    )
    expect(read('.claude/skills/verify-mylder/SKILL.md')).toContain(
      `launch.sh main-<n> ${VERIFY_PORTS.main}`,
    )
  })
})
