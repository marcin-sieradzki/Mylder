'use client'

import {
  Accordion,
  AccordionItem,
  Button,
  NormalService,
  Section,
  Tag,
  Text,
  type SeverityLabelSeverity,
} from '@mylder/perron'
import { DisruptionCard, type DisruptionCardProps } from '@mylder/perron/patterns'
import { useId } from 'react'
import type { DataCard } from '../domain/data-cards'
import { checkedEvery, type DisruptionKind } from '../domain/disruption'
import type { ClientDictionary } from '../i18n/dictionary'
import { intlLocale, type Lang } from '../i18n/lang'
import { useI18n } from '../i18n/useI18n'
import {
  disruptionList,
  useDataCards,
  useListedDisruptions,
  type DisruptionListStore,
  type ListedDisruptions,
} from '../map/disruptions'
import { disruptionHighlight, disruptionStops, mapHighlight } from '../map/highlight'
import { useSnapshot, useSource } from '../map/live'
import { timezoneOf, useNetwork } from '../map/timetable'
import type { Mode } from '../timetable/format'
import type { Network } from '../timetable/network'
import { clockTime } from '../timetable/time'
import { dayOf } from './wording'
import type { Disruption, Snapshot } from '../tracker/index'
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

/** How the screen writes moments: in its language, on the timetable's clock, against now. */
interface Clock {
  readonly lang: Lang
  readonly timezone: string
  readonly now: number
}

const formats = new Map<string, Intl.DateTimeFormat>()

/** A moment as `options` write it in the clock's language and zone, its format made once. */
function formatted(moment: number, { lang, timezone }: Clock, options: Intl.DateTimeFormatOptions) {
  const key = `${lang} ${timezone} ${JSON.stringify(options)}`
  let format = formats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(lang), { timeZone: timezone, ...options })
    formats.set(key, format)
  }
  return format.format(moment)
}

const DAY: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }
const MONTH: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit' }
const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
const DAY_OF_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric' }

/** A `<time>` for a moment, as `text`. */
const timeElement = (moment: number, text: string) => (
  <time dateTime={new Date(moment).toISOString()}>{text}</time>
)

/**
 * A message's time, as its card says it: "05:00 to 23:30" within one day, with its date when that
 * day is not today; "15 to 18 June" across days; one end alone, "From 08:03" or "Until 18 June".
 * An end at midnight closes the day before it.
 */
function timeOfMessage({ from, to }: Disruption, clock: Clock): DisruptionCardProps['time'] {
  const today = formatted(clock.now, clock, DAY)
  const hours = (moment: number) => clockTime(moment, clock.timezone)
  const date = (moment: number) => formatted(moment, clock, DATE)
  /** One end alone: its clock time today, else its date. */
  const alone = (moment: number, day: number) =>
    timeElement(moment, formatted(day, clock, DAY) === today ? hours(moment) : date(day))
  if (from === undefined || to === undefined) {
    return {
      ...(from === undefined ? {} : { from: alone(from, from) }),
      ...(to === undefined ? {} : { to: alone(to, to - 1) }),
    }
  }
  const lastDay = to - 1
  if (formatted(from, clock, DAY) === formatted(lastDay, clock, DAY)) {
    const onDay = formatted(from, clock, DAY) === today ? '' : `${date(from)} `
    return { from: timeElement(from, `${onDay}${hours(from)}`), to: timeElement(to, hours(to)) }
  }
  const sameMonth = formatted(from, clock, MONTH) === formatted(lastDay, clock, MONTH)
  return {
    from: timeElement(from, formatted(from, clock, sameMonth ? DAY_OF_MONTH : DATE)),
    to: timeElement(to, date(lastDay)),
  }
}

/** The stops a card names: the stretch between its two ends, else every stop it affects. */
function stopsOf({ message }: Disruption): DisruptionCardProps['stops'] {
  const { validFromStop: from, validToStop: to } = message
  if (from && to && from.name !== to.name) return { from: from.name, to: to.name }
  const named = message.affectedStops?.StopLocation.map(({ name }) => name) ?? []
  return [...new Set(named)]
}

interface MessageCardProps {
  readonly disruption: Disruption
  readonly kind: DisruptionKind
  readonly clock: Clock
  /** The timetable's network, which Show on map draws on; none until it has loaded. */
  readonly network: Network | undefined
}

/**
 * One of Rejseplanen's messages as a card, in Rejseplanen's own words, which are Danish: its
 * heading, its lead, and its full text behind "More" when it says more.
 */
function MessageCard({ disruption, kind, clock, network }: MessageCardProps) {
  const { dictionary } = useI18n()
  const words = dictionary.disruptions
  const { head, lead, text } = disruption.message
  const sentence = lead ?? text
  const more = lead !== undefined && text !== undefined && text.length > lead.length
  const severity = SEVERITY[kind]
  const { affectedStops, validFromStop, validToStop } = disruption.message
  // A message that names no stops has no Show on map; one naming none the timetable knows has
  // nothing to show.
  const namesStops = Boolean(affectedStops?.StopLocation.length || validFromStop || validToStop)
  const showOnMap = namesStops ? (
    <Button
      variant="outline"
      size="small"
      disabled={!network || disruptionStops(network, disruption).length === 0}
      onClick={() => {
        if (network) mapHighlight.show(disruptionHighlight(network, disruption, severity))
      }}
    >
      {words.showOnMap}
    </Button>
  ) : undefined
  return (
    <DisruptionCard
      render={<li />}
      severity={severity}
      title={head}
      stops={stopsOf(disruption)}
      time={timeOfMessage(disruption, clock)}
      action={showOnMap}
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
        <ul aria-label={dictionary.topBar.modes} className={styles.modes}>
          {disruption.modes.map((mode) => (
            <Tag key={mode} render={<li />}>
              {dictionary.modes[mode]}
            </Tag>
          ))}
        </ul>
      ) : null}
    </DisruptionCard>
  )
}

/** A data card's sentence, with its time on the timetable's clock or its date in the language. */
function sentenceOf(card: DataCard, words: Words['dataCards'], lang: Lang, timezone: string) {
  const at = (moment: number) => clockTime(moment, timezone)
  switch (card.kind) {
    case 'paused':
      return card.resumes === undefined
        ? words.pausedNoDate
        : words.paused.replace('{date}', dayOf(card.resumes, lang))
    case 'no-answer':
      return words.noAnswer.replace('{time}', at(card.since))
    case 'mode-quiet':
      // The snapshot's modes are the timetable's.
      return words.modeQuiet[card.mode as Mode].replace('{time}', at(card.since))
    case 'messages-stale':
      return card.since === undefined
        ? words.messagesNever
        : words.messagesStale.replace('{time}', at(card.since))
  }
}

/**
 * Mylder's own data cards (docs/screens.md, "Disruptions"), first in the list and marked as
 * Mylder's: each a data feed card whose title says what is missing and since when.
 */
function DataCards({ timezone }: { timezone: string }) {
  const { lang, dictionary } = useI18n()
  const words = dictionary.disruptions.dataCards
  const cards = useDataCards()
  if (cards.length === 0) return null
  return (
    <ul aria-label={words.title} className={styles.cards}>
      {cards.map((card) => (
        <DisruptionCard
          key={card.kind === 'mode-quiet' ? `${card.kind}-${card.mode}` : card.kind}
          render={<li />}
          severity="data"
          title={sentenceOf(card, words, lang, timezone)}
        >
          <Text variant="caption" emphasis="secondary" render={<p />}>
            {words.mine}
          </Text>
        </DisruptionCard>
      ))}
    </ul>
  )
}

/**
 * The footer's lines (docs/screens.md, "Footer"): when the list was last checked, the time of its
 * last good answer, how often it is checked, and whether it may be out of date or incomplete.
 */
function footerOf(
  { list, reading }: ListedDisruptions,
  level: Snapshot['budget']['level'] | undefined,
  timezone: string,
  words: Words,
): string[] {
  const lastGood = list.fetched === null ? undefined : clockTime(list.fetched, timezone)
  const every = checkedEvery(level ?? 'normal')
  const lines: string[] = []
  if (list.checked === null) lines.push(words.notChecked)
  else if (lastGood === undefined) lines.push(words.failed)
  else if (reading.lastCheckFailed) lines.push(words.lastChecked.replace('{time}', lastGood))
  else lines.push(words.checked.replace('{time}', lastGood))
  if (reading.outOfDate) lines.push(words.outOfDate)
  if (every !== undefined) lines.push(words.every.replace('{minutes}', String(every)))
  if (reading.mayBeIncomplete) lines.push(words.incomplete)
  return lines
}

/**
 * The Disruptions tab (docs/screens.md, "Disruptions"): Mylder's own data cards, Rejseplanen's
 * messages active now, then those starting within the week under "Later", "Running normally"
 * once when nothing is active, and a footer that says when the list was checked. On a source that
 * brings no messages, such as the timetable, one sentence in their place: the messages come with
 * the live connection.
 */
export function DisruptionList({ store = disruptionList }: { store?: DisruptionListStore }) {
  const { lang, dictionary } = useI18n()
  const words = dictionary.disruptions
  const listed = useListedDisruptions(store)
  const snapshot = useSnapshot()
  const network = useNetwork(snapshot?.timetableVersion)
  const timezone = timezoneOf(network)
  const laterHeading = useId()
  const messages = useSource()?.messages !== false

  if (!messages) {
    return (
      <div className={styles.list}>
        <Text variant="body-sm" emphasis="secondary" render={<p />} className={styles.loading}>
          {dictionary.timetableOverview.disruptions}
        </Text>
      </div>
    )
  }

  if (!listed) {
    return (
      <div className={styles.list}>
        <DataCards timezone={timezone} />
        <Text variant="body-sm" emphasis="secondary" render={<p />} className={styles.loading}>
          {words.loading}
        </Text>
      </div>
    )
  }

  const { list, reading, now } = listed
  const clock: Clock = { lang, timezone, now }
  return (
    <div className={styles.list}>
      <DataCards timezone={timezone} />
      {reading.runningNormally && list.checked !== null ? (
        <NormalService
          runningNormallyLabel={words.runningNormally.replace(
            '{time}',
            clockTime(list.checked, timezone),
          )}
        />
      ) : null}
      {reading.active.length > 0 ? (
        <ul aria-label={words.active} className={styles.cards}>
          {reading.active.map(({ disruption, kind }) => (
            <MessageCard
              key={disruption.message.id}
              disruption={disruption}
              kind={kind}
              clock={clock}
              network={network}
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
                clock={clock}
                network={network}
              />
            ))}
          </ul>
        </Section>
      ) : null}
      <div className={styles.footer}>
        {footerOf(listed, snapshot?.budget.level, timezone, words).map((line) => (
          <Text key={line} variant="caption" emphasis="secondary" render={<p />}>
            {line}
          </Text>
        ))}
      </div>
    </div>
  )
}
