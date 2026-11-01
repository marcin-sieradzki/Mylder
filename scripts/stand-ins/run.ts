// The stand-ins job: `npm run stand-ins` opens a Mylder ticket for each Perron issue a
// `perron-stand-in` marker names once Perron closes it; `-- --dry-run` only prints them. The
// weekly Stand-ins workflow runs it with the workflow's token; locally it reads without one.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  findStandIns,
  PERRON,
  ticketsToOpen,
  type MylderIssue,
  type PerronIssue,
} from './stand-ins.ts'

/** Where the app's code lives; the markers sit in its comments. */
const ROOTS = ['app', 'src']
const KINDS = /\.(ts|tsx|css)$/

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } })
const repository = process.env.GITHUB_REPOSITORY ?? 'marcin-sieradzki/mylder'
const token = process.env.GITHUB_TOKEN

async function github<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  const response = await fetch(`https://api.github.com/${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
  })
  if (!response.ok) throw new Error(`GitHub answered ${response.status} to ${path}`)
  return (await response.json()) as T
}

async function files(): Promise<{ path: string; text: string }[]> {
  const paths = (
    await Promise.all(
      ROOTS.map(async (root) =>
        (await readdir(root, { recursive: true })).map((path) => join(root, path)),
      ),
    )
  )
    .flat()
    .filter((path) => KINDS.test(path))
    .sort()
  return Promise.all(paths.map(async (path) => ({ path, text: await readFile(path, 'utf8') })))
}

interface GitHubIssue {
  readonly number: number
  readonly title: string
  readonly body: string | null
  readonly state: 'open' | 'closed'
  readonly state_reason: PerronIssue['stateReason']
  readonly pull_request?: unknown
}

/** Every issue of the repository, open or closed, without its pull requests. */
async function allIssues(repo: string): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = []
  for (let page = 1; ; page++) {
    const batch = await github<GitHubIssue[]>(
      `repos/${repo}/issues?state=all&per_page=100&page=${page}`,
    )
    issues.push(...batch.filter((issue) => issue.pull_request === undefined))
    if (batch.length < 100) return issues
  }
}

const standIns = findStandIns(await files())
const numbers = [...new Set(standIns.map(({ issue }) => issue))].sort((a, b) => a - b)
const perron: PerronIssue[] = await Promise.all(
  numbers.map(async (number) => {
    const issue = await github<GitHubIssue>(`repos/${PERRON}/issues/${number}`)
    return { number, title: issue.title, state: issue.state, stateReason: issue.state_reason }
  }),
)
const mylder: MylderIssue[] = await allIssues(repository)

for (const { number, title, state } of perron) {
  const places = standIns.filter(({ issue }) => issue === number).length
  console.log(`perron#${number} (${state}), ${places} marker(s): ${title}`)
}

const tickets = ticketsToOpen(standIns, perron, mylder)
if (tickets.length === 0) console.log('No ticket to open.')
for (const ticket of tickets) {
  if (values['dry-run']) {
    console.log(`Would open "${ticket.title}":\n\n${ticket.body}`)
    continue
  }
  const opened = await github<{ html_url: string }>(`repos/${repository}/issues`, {
    method: 'POST',
    body: ticket,
  })
  console.log(`Opened ${opened.html_url}`)
}
