'use client'

import { Text } from '@mylder/perron'
import { DisruptionCard, type DisruptionCardProps } from '@mylder/perron/patterns'
import type { ComponentProps } from 'react'
import { disruptionKind, disruptionPhase, type DisruptionKind } from '../domain/disruption'
import type { ClientDictionary } from '../i18n/dictionary'
import { intlLocale, type Lang } from '../i18n/lang'
import { clockTime } from '../timetable/time'
import type { Disruption } from '../tracker/index'
import styles from './StopPanel.module.css'

type Words = ClientDictionary['stop']

/** The card's severity for each kind a disruption card names. */
const SEVERITY: Readonly<Record<DisruptionKind, DisruptionCardProps['severity']>> = {
  delays: 'delay',
  diversion: 'diversion',
  'planned-works': 'planned',
  'data-feed': 'data',
  'service-notice': 'notice',
}

/** The headings a card's title or Later renders as, the text given as their children. */
const HEADINGS = {
  h3: ({ children, ...props }: ComponentProps<'h3'>) => <h3 {...props}>{children}</h3>,
  h4: ({ children, ...props }: ComponentProps<'h4'>) => <h4 {...props}>{children}</h4>,
}

const days = new Map<string, Intl.DateTimeFormat>()

/** A moment's date on the timetable's clock as the language writes it: "24 October", "24. oktober". */
function dayOf(moment: number, lang: Lang, timezone: string): string {
  const key = `${lang} ${timezone}`
  let format = days.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(intlLocale(lang), {
      day: 'numeric',
      month: 'long',
      timeZone: timezone,
    })
    days.set(key, format)
  }
  return format.format(moment)
}

/** A moment as a card writes it: its clock time on the day of `now`, else its date. */
function whenOf(moment: number, now: number, lang: Lang, timezone: string): string {
  return dayOf(moment, lang, timezone) === dayOf(now, lang, timezone)
    ? clockTime(moment, timezone)
    : dayOf(moment, lang, timezone)
}

/** The stops a message names, as received: its stretch's two ends, else those it affects. */
function stopsOf({ message }: Disruption): DisruptionCardProps['stops'] {
  if (message.validFromStop && message.validToStop) {
    return { from: message.validFromStop.name, to: message.validToStop.name }
  }
  return message.affectedStops?.StopLocation.map((stop) => stop.name)
}

interface StopMessagesProps {
  messages: readonly Disruption[]
  now: number
  lang: Lang
  timezone: string
  words: Words
}

/**
 * The stop's messages (docs/screens.md, "Stop departures", "Messages"; "Disruptions", "A card"):
 * those active now, then those starting within the week under Later, each a card of its kind,
 * with its heading and lead as Rejseplanen wrote them, in Danish, its stops and its time. Kind and
 * phase come from the domain's rule at `now`, so a card moves from Later as its start passes.
 */
export function StopMessages({ messages, now, lang, timezone, words }: StopMessagesProps) {
  const active: Disruption[] = []
  const later: Disruption[] = []
  for (const disruption of messages) {
    const phase = disruptionPhase(disruption, now)
    if (phase === 'active') active.push(disruption)
    else if (phase === 'later') later.push(disruption)
  }
  if (active.length + later.length === 0) return null
  /** One card, its title a heading under the panel's, or under Later's. */
  const card = (disruption: Disruption, heading: 'h3' | 'h4') => {
    const { message, from, to } = disruption
    return (
      <li key={message.id}>
        <DisruptionCard
          severity={SEVERITY[disruptionKind(disruption, now)]}
          title={message.head}
          stops={stopsOf(disruption)}
          time={{
            ...(from === undefined ? {} : { from: whenOf(from, now, lang, timezone) }),
            ...(to === undefined ? {} : { to: whenOf(to, now, lang, timezone) }),
          }}
          slotProps={{ title: { render: HEADINGS[heading] } }}
        >
          {message.lead}
        </DisruptionCard>
      </li>
    )
  }
  return (
    <section className={styles.messages} aria-label={words.messages}>
      {active.length === 0 ? null : (
        <ul className={styles.cards}>{active.map((each) => card(each, 'h3'))}</ul>
      )}
      {later.length === 0 ? null : (
        <>
          <Text variant="heading-sm" render={HEADINGS.h3}>
            {words.later}
          </Text>
          <ul className={styles.cards}>{later.map((each) => card(each, 'h4'))}</ul>
        </>
      )}
      <Text variant="caption" emphasis="secondary">
        {words.messagesSource}
      </Text>
    </section>
  )
}
