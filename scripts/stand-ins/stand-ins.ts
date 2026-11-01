// The app's stand-ins for Perron pieces it lacks (ADR 0004), each marked in a comment with the
// Perron issue that will replace it, `perron-stand-in: perron#<n>`, and the Mylder tickets to open
// once Perron closes one. `run.ts` reads the files and the issues; this works out the rest.

/** The Perron repository a marker's `perron#<n>` names. */
export const PERRON = 'marcin-sieradzki/perron'

const MARKER = /perron-stand-in: perron#(\d+)\b/g

/** One marker: the Perron issue, and where it sits. */
export interface StandIn {
  readonly issue: number
  readonly path: string
  /** Counted from 1. */
  readonly line: number
}

/** A Perron issue a marker names, as GitHub has it. */
export interface PerronIssue {
  readonly number: number
  readonly title: string
  readonly state: 'open' | 'closed'
  readonly stateReason: 'completed' | 'not_planned' | 'duplicate' | 'reopened' | null
}

/** Any Mylder issue, open or closed, to know the tickets already opened. */
export interface MylderIssue {
  readonly title: string
  readonly body: string | null
}

export interface Ticket {
  readonly title: string
  readonly body: string
}

/** Every marker in the files, in the files' order. */
export function findStandIns(files: readonly { path: string; text: string }[]): StandIn[] {
  return files.flatMap(({ path, text }) =>
    text.split('\n').flatMap((line, index) =>
      [...line.matchAll(MARKER)].map((match) => ({
        issue: Number(match[1]),
        path,
        line: index + 1,
      })),
    ),
  )
}

export const ticketTitle = (issue: number): string =>
  `Replace the Perron stand-in for perron#${issue}`

/**
 * A ticket for each closed Perron issue a marker names, unless a Mylder issue already answers it:
 * one with the ticket's title, or with the marker in its body, so a renamed ticket still counts.
 */
export function ticketsToOpen(
  standIns: readonly StandIn[],
  perron: readonly PerronIssue[],
  mylder: readonly MylderIssue[],
): Ticket[] {
  const answered = new Set(
    mylder.flatMap(({ title, body }) => {
      const marked = findStandIns([{ path: '', text: body ?? '' }]).map(({ issue }) => issue)
      const titled = perron.filter(({ number }) => title === ticketTitle(number))
      return [...marked, ...titled.map(({ number }) => number)]
    }),
  )
  return perron
    .filter(({ number, state }) => state === 'closed' && !answered.has(number))
    .map((issue) => ({
      title: ticketTitle(issue.number),
      body: ticketBody(
        issue,
        standIns.filter(({ issue: n }) => n === issue.number),
      ),
    }))
}

function ticketBody(issue: PerronIssue, places: readonly StandIn[]): string {
  const named = `${PERRON}#${issue.number}, "${issue.title}"`
  const why =
    issue.stateReason === 'completed'
      ? `Perron closed ${named}, so the stand-in Mylder keeps for it can go (ADR 0004).`
      : `Perron closed ${named} as ${(issue.stateReason ?? 'closed').replace('_', ' ')}, so no Perron piece may come for the stand-in Mylder keeps: read why it closed, then ask Perron again or keep the stand-in and remove its marker.`
  return [
    why,
    '',
    '## What to do',
    '',
    "Take up the `@mylder/perron` release whose changelog names it, put Perron's piece where the stand-in is, and remove the stand-in and its marker.",
    '',
    '## Where',
    '',
    ...places.map(({ path, line }) => `- \`${path}:${line}\``),
    '',
    `perron-stand-in: perron#${issue.number}`,
    '',
  ].join('\n')
}
