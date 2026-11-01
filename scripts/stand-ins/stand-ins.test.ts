import { describe, expect, it } from 'vitest'
import {
  findStandIns,
  ticketsToOpen,
  ticketTitle,
  type MylderIssue,
  type PerronIssue,
} from './stand-ins.ts'

const closed = (number: number, reason: PerronIssue['stateReason'] = 'completed'): PerronIssue => ({
  number,
  title: `Perron issue ${number}`,
  state: 'closed',
  stateReason: reason,
})

const open = (number: number): PerronIssue => ({
  number,
  title: `Perron issue ${number}`,
  state: 'open',
  stateReason: null,
})

describe('finding the stand-ins', () => {
  it('finds each marker with its file and line, in any kind of comment', () => {
    expect(
      findStandIns([
        { path: 'src/a.ts', text: "import x from 'y'\n// perron-stand-in: perron#191\n" },
        { path: 'src/b.module.css', text: '/* perron-stand-in: perron#190 */\n.card {}\n' },
        { path: 'src/c.tsx', text: '/**\n * perron-stand-in: perron#190\n */\n' },
      ]),
    ).toEqual([
      { issue: 191, path: 'src/a.ts', line: 2 },
      { issue: 190, path: 'src/b.module.css', line: 1 },
      { issue: 190, path: 'src/c.tsx', line: 2 },
    ])
  })

  it('finds none in a file that only names a Perron issue', () => {
    expect(findStandIns([{ path: 'src/a.ts', text: '// Perron has it (perron#191).\n' }])).toEqual(
      [],
    )
  })
})

describe('the tickets to open', () => {
  const standIns = [
    { issue: 190, path: 'src/screens/StopPanel.tsx', line: 567 },
    { issue: 190, path: 'src/screens/StopPanel.module.css', line: 41 },
    { issue: 191, path: 'src/screens/usePeekTo.ts', line: 8 },
  ]

  it('opens none while every Perron issue is open', () => {
    expect(ticketsToOpen(standIns, [open(190), open(191)], [])).toEqual([])
  })

  it('opens one ticket for a closed Perron issue, naming every place its stand-in sits', () => {
    const tickets = ticketsToOpen(standIns, [closed(190), open(191)], [])
    expect(tickets.map(({ title }) => title)).toEqual([ticketTitle(190)])
    const [{ body }] = tickets
    expect(body).toContain('marcin-sieradzki/perron#190')
    expect(body).toContain('perron-stand-in: perron#190')
    expect(body).toContain('`src/screens/StopPanel.tsx:567`')
    expect(body).toContain('`src/screens/StopPanel.module.css:41`')
    expect(body).not.toContain('usePeekTo')
  })

  it('opens none for a Perron issue a Mylder issue already answers, open or closed', () => {
    const answered: MylderIssue[] = [{ title: ticketTitle(190), body: null }]
    expect(ticketsToOpen(standIns, [closed(190), closed(191)], answered)).toEqual([
      expect.objectContaining({ title: ticketTitle(191) }),
    ])
  })

  it('knows a ticket whose title was changed by the marker in its body', () => {
    const renamed: MylderIssue[] = [
      {
        title: 'Use the StandingCard',
        body: 'Perron shipped it.\n\nperron-stand-in: perron#190\n',
      },
    ]
    expect(ticketsToOpen(standIns, [closed(190), open(191)], renamed)).toEqual([])
  })

  it('says Perron is not building it when the issue closed as not planned', () => {
    const [{ body }] = ticketsToOpen(standIns, [closed(191, 'not_planned'), open(190)], [])
    expect(body).toContain('not planned')
  })
})
