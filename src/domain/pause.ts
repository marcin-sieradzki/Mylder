// When live data is paused, as docs/data-states.md ("When the answers stop") gives it: at once
// while the month's calls are spent, since the server knows; while Rejseplanen fails or answers
// nothing, once its last good answer is old enough. The page notice waits the Live limit, the
// data card 5 min; both read this one rule. Times are milliseconds since the epoch.

/** What the rule reads of a snapshot. */
export interface PauseFacts {
  readonly api: { readonly status: 'ok' | 'empty' | 'error' | 'spent'; readonly since: number }
  readonly budget: {
    readonly level: 'normal' | 'stretched' | 'tight' | 'spent'
    readonly resumes?: string
  }
  /** By mode, when a position answer last carried one of its trips this service day. */
  readonly lastSeen: Readonly<Record<string, number>>
}

/** Why live data is paused: the month is spent, until a date, or no answer has come since a moment. */
export type Pause =
  | { readonly reason: 'spent'; readonly resumes?: string }
  | { readonly reason: 'no-answer'; readonly since: number }

/**
 * When a position answer last carried a trip of any mode, this service day; none if none has. The
 * snapshot carries it through failed, empty and spent runs alike, so it survives a reload.
 */
export function lastCarried(lastSeen: PauseFacts['lastSeen']): number | undefined {
  const moments = Object.values(lastSeen)
  return moments.length === 0 ? undefined : Math.max(...moments)
}

/**
 * The last good position answer a snapshot knows of: its own time while the API answers well,
 * else the last answer that carried a trip. None when no answer has carried one this service day.
 */
export function lastAnswer(facts: PauseFacts & { readonly fetched: number }): number | undefined {
  return facts.api.status === 'ok' ? facts.fetched : lastCarried(facts.lastSeen)
}

/**
 * Whether live data is paused at `now`: at once while the month is spent; while Rejseplanen fails
 * or answers nothing, once its last good answer is `after` ms old. That answer is timed from
 * `lastSeen`, so it holds while the API's health switches between failing and empty; with none
 * this service day, from the moment the health began. An answer that carries no trip, as one may
 * at night, leaves no mark there, so after one the pause can come sooner.
 */
export function pauseAt(facts: PauseFacts, now: number, after: number): Pause | undefined {
  const { api, budget } = facts
  if (budget.level === 'spent' || api.status === 'spent') {
    return { reason: 'spent', ...(budget.resumes ? { resumes: budget.resumes } : {}) }
  }
  if (api.status === 'ok') return undefined
  const since = lastCarried(facts.lastSeen) ?? api.since
  return now - since >= after ? { reason: 'no-answer', since } : undefined
}
