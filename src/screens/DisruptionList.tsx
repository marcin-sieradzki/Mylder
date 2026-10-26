'use client'

import {
  Accordion,
  AccordionItem,
  NormalService,
  Section,
  Tag,
  Text,
  type SeverityLabelSeverity,
} from '@mylder/perron'
import { DisruptionCard, type DisruptionCardProps } from '@mylder/perron/patterns'
import { useId } from 'react'
import { readList, type DisruptionKind } from '../domain/disruption'
import type { ClientDictionary } from '../i18n/dictionary'
import { intlLocale, type Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import { disruptionList, useDisruptionList, type DisruptionListStore } from '../map/disruptions'
import { useLiveSnapshot } from '../map/live'
import { timezoneOf, useNetwork } from '../map/timetable'
import { clockTime } from '../timetable/time'
import type { Disruption, Disruptions, Snapshot } from '../tracker/index'
import styles from './DisruptionList.module.css'

type Words = ClientDictionary['disruptions']

/** Each kind as its SeverityLabel's severity. */
const SEVERITY: Record<DisruptionKind, SeverityLabelSeverity> = {
  delays: 'delay',
  diversion: 'diversion',
  'planned-works': 'planned',
  'data-feed': 'data',
  'service-notice': 'notice',
}

/** How often the list is checked, in minutes, at each budget level: never once the month is spent. */
const CHECKED_EVERY: Record<Snapshot['budget']['level'], number | undefined> = {
  normal: 15,
  stretched: 15,
  tight: 30,
  spent: undefined,
}

interface Clock {
  readonly lang: Lang
  readonly timezone: string
  readonly now: number
}

const formats = new Map<string, Intl.DateTimeFormat>()

/** A moment in the zone as `options` write it in the language, its format made once. */
function written(moment: number, { lang, timezone }: Clock, options: Intl.DateTimeFormatOptions) {
  const key = `${lang} ${timezone} ${JSON.stringify(options)}`
  let format = formats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(lang), { timeZone: timezone, ...options })
    formats.set(key, format)
  }
  return format.format(moment)
}

/** The day a moment falls on in the zone, to compare days by. */
const dayOf = (moment: number, clock: Clock) =>
  written(moment, clock, { year: 'numeric', month: '2-digit', day: '2-digit' })

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
const DAY_ONLY: Intl.DateTimeFormatOptions = { day: 'numeric' }

/** A `<time>` for a moment, as `text`. */
const timeOf = (moment: number, text: string) => (
  <time dateTime={new Date(moment).toISOString()}>{text}</time>
)

/**
 * A message's time, as its card says it: "05:00 to 23:30" within one day, with its date when that
 * day is not today; "15 to 18 June" across days; one end alone, "From 08:03" or "Until 18 June".
 */
function timeOfMessage({ from, to }: Disruption, clock: Clock): DisruptionCardProps['time'] {
  const today = dayOf(clock.now, clock)
  const clockOf = (moment: number) => clockTime(moment, clock.timezone)
  const dateOf = (moment: number) => written(moment, clock, DATE)
  /** One end alone: its clock time today, else its date. */
  const end = (moment: number) =>
    timeOf(moment, dayOf(moment, clock) === today ? clockOf(moment) : dateOf(moment))
  if (from === undefined || to === undefined) {
    return {
      ...(from === undefined ? {} : { from: end(from) }),
      ...(to === undefined ? {} : { to: end(to) }),
    }
  }
  if (dayOf(from, clock) === dayOf(to, clock)) {
    const start = dayOf(from, clock) === today ? clockOf(from) : `${dateOf(from)} ${clockOf(from)}`
    return { from: timeOf(from, start), to: timeOf(to, clockOf(to)) }
  }
  const sameMonth =
    written(from, clock, { month: 'numeric' }) === written(to, clock, { month: 'numeric' })
  return {
    from: timeOf(from, written(from, clock, sameMonth ? DAY_ONLY : DATE)),
    to: timeOf(to, dateOf(to)),
  }
}

/** The stops a card names: the stretch between its two ends, else every stop it affects. */
function stopsOf({ message }: Disruption): DisruptionCardProps['stops'] {
  const { validFromStop: from, validToStop: to } = message
  if (from && to && from.name !== to.name) return { from: from.name, to: to.name }
  const named = message.affectedStops?.StopLocation.map(({ name }) => name) ?? []
  return [...new Set(named)]
}

interface CardProps {
  readonly disruption: Disruption
  readonly kind: DisruptionKind
  readonly clock: Clock
  readonly words: Words
  readonly modes: ClientDictionary['modes']
  readonly modesLabel: string
}

/**
 * One of Rejseplanen's messages as a card, in Rejseplanen's own words, which are Danish: its
 * heading, its lead, and its full text behind "More" when it says more.
 */
function MessageCard({ disruption, kind, clock, words, modes, modesLabel }: CardProps) {
  const { head, lead, text } = disruption.message
  const sentence = lead ?? text
  const more = lead !== undefined && text !== undefined && text.length > lead.length
  return (
    <DisruptionCard
      render={<li />}
      severity={SEVERITY[kind]}
      title={head}
      stops={stopsOf(disruption)}
      time={timeOfMessage(disruption, clock)}
      slotProps={{ title: { lang: 'da' } }}
    >
      {sentence === undefined ? null : <p lang="da">{sentence}</p>}
      {more ? (
        <Accordion className={styles.more}>
          <AccordionItem title={words.more}>
            <p lang="da">{text}</p>
          </AccordionItem>
        </Accordion>
      ) : null}
      {clock.lang === 'da' ? null : (
        <Text variant="caption" emphasis="secondary" render={<p />}>
          {words.inDanish}
        </Text>
      )}
      {disruption.modes.length > 0 ? (
        <ul aria-label={modesLabel} className={styles.modes}>
          {disruption.modes.map((mode) => (
            <Tag key={mode} render={<li />}>
              {modes[mode]}
            </Tag>
          ))}
        </ul>
      ) : null}
    </DisruptionCard>
  )
}

/** The footer's lines: when the list was checked, how often, and whether it may be incomplete. */
function footerOf(
  list: Disruptions,
  reading: ReturnType<typeof readList<Disruption>>,
  level: Snapshot['budget']['level'] | undefined,
  clock: Clock,
  words: Words,
): string[] {
  const at = list.fetched === null ? undefined : clockTime(list.fetched, clock.timezone)
  const every = CHECKED_EVERY[level ?? 'normal']
  const lines: string[] = []
  if (list.checked === null) lines.push(words.notChecked)
  else if (at === undefined) lines.push(words.failed)
  else if (reading.lastCheckFailed) lines.push(words.lastChecked.replace('{time}', at))
  else lines.push(words.checked.replace('{time}', at))
  if (reading.outOfDate) lines.push(words.outOfDate)
  if (every !== undefined) lines.push(words.every.replace('{minutes}', String(every)))
  if (reading.mayBeIncomplete) lines.push(words.incomplete)
  return lines
}

/**
 * The Disruptions tab (docs/screens.md, "Disruptions"): Rejseplanen's messages active now, then
 * those starting within the week under "Later", "Running normally" once when nothing is active,
 * and a footer that says when the list was checked.
 */
export function DisruptionList({ store = disruptionList }: { store?: DisruptionListStore }) {
  const { lang, dictionary } = useI18n()
  const words = dictionary.disruptions
  const list = useDisruptionList(store)
  const { snapshot, clockOffset, lastGoodPoll } = useLiveSnapshot()
  const timezone = timezoneOf(useNetwork(snapshot?.timetableVersion))
  const laterHeading = useId()

  if (!list) {
    return (
      <Text variant="body-sm" emphasis="secondary" render={<p />} className={styles.footer}>
        {words.loading}
      </Text>
    )
  }

  // The server's clock when the latest poll landed, so the list moves on with each poll; before
  // the first, when the list was last checked.
  const now =
    lastGoodPoll === undefined ? (list.checked ?? list.fetched ?? 0) : lastGoodPoll + clockOffset
  const clock: Clock = { lang, timezone, now }
  const reading = readList(list, clock.now)
  const card = { clock, words, modes: dictionary.modes, modesLabel: dictionary.topBar.modes }
  return (
    <div className={styles.list}>
      {reading.runningNormally ? <NormalService /> : null}
      {reading.active.length > 0 ? (
        <ul aria-label={words.active} className={styles.cards}>
          {reading.active.map(({ disruption, kind }) => (
            <MessageCard
              key={disruption.message.id}
              disruption={disruption}
              kind={kind}
              {...card}
            />
          ))}
        </ul>
      ) : null}
      {reading.later.length > 0 ? (
        <Section
          title={words.later}
          slotProps={{ title: { id: laterHeading } }}
          className={styles.later}
        >
          <ul aria-labelledby={laterHeading} className={styles.cards}>
            {reading.later.map(({ disruption, kind }) => (
              <MessageCard
                key={disruption.message.id}
                disruption={disruption}
                kind={kind}
                {...card}
              />
            ))}
          </ul>
        </Section>
      ) : null}
      <footer className={styles.footer}>
        {footerOf(list, reading, snapshot?.budget.level, clock, words).map((line) => (
          <Text key={line} variant="caption" emphasis="secondary" render={<p />}>
            {line}
          </Text>
        ))}
      </footer>
    </div>
  )
}
