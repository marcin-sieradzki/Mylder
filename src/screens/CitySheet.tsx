'use client'

import { Sheet, Tab, Tabs, TabsList, TabsPanel } from '@mylder/perron'
import { useRef, type ReactNode, type RefObject } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useDataCards, useListedDisruptions } from '../map/disruptions'
import { useSnapshot, useSource } from '../map/live'
import { onMap } from '../map/vehicles'
import { isTab, mapView, SHEET_TABS, useHiddenModes, useSheetTab, type SheetTab } from '../map/view'
import { CityPulse } from './CityPulse'
import styles from './CitySheet.module.css'
import { DisruptionList } from './DisruptionList'
import { usePhone } from './usePhone'
import { VehicleList } from './VehicleList'

interface CitySheetProps {
  /** Whether the sheet is open. */
  open: boolean
  /** Called when the sheet asks to close. */
  onClose: () => void
  /** Whether a press opened it, so focus moves into it; the page opens it without moving focus. */
  asked: boolean
  /** Where focus goes once it closes: the button that opens it again. */
  opener: RefObject<HTMLButtonElement | null>
  /** Whether a detail panel is open, whose bottom sheet a phone shows in front of this one. */
  behindPanel: boolean
}

const PANELS: Record<SheetTab, ReactNode> = {
  pulse: <CityPulse />,
  vehicles: <VehicleList />,
  disruptions: <DisruptionList />,
}

/**
 * The sheet beside the map (docs/screens.md): City pulse, the Vehicles list and Disruptions as
 * tabs, in a side sheet on a desktop and a bottom sheet with a peek on a phone. The open tab is
 * kept in the address.
 */
export function CitySheet({ open, onClose, asked, opener, behindPanel }: CitySheetProps) {
  const { dictionary } = useI18n()
  const words = dictionary.sheet
  const tab = useSheetTab()
  const hidden = useHiddenModes()
  const snapshot = useSnapshot()
  const messages = useSource()?.messages !== false
  // Loaded with the page, so the tab counts its cards before it opens.
  const disruptions = useListedDisruptions()?.reading
  const dataCards = useDataCards()
  const popup = useRef<HTMLDivElement>(null)
  const counts: Partial<Record<SheetTab, number>> = {
    // The trips on the map after the filters.
    vehicles: snapshot?.trips.filter((trip) => onMap(trip, hidden)).length,
    // The cards listed: Mylder's own, shown at once, and Rejseplanen's once its list has come;
    // none on a source that brings no messages, such as the timetable, which lists no card.
    disruptions:
      messages && (disruptions || dataCards.length > 0)
        ? dataCards.length +
          (disruptions ? disruptions.active.length + disruptions.later.length : 0)
        : undefined,
  }

  return (
    <Sheet
      ref={popup}
      anchor={usePhone() ? 'bottom' : 'left'}
      title={words.title}
      open={open}
      onClose={(_event, reason, details) => {
        // The sheet stays open beside the map: Esc closes it only from inside it, not when it
        // closes a dot's card or a dialog elsewhere on the page.
        if (reason === 'escape-key' && !popup.current?.contains(document.activeElement)) {
          details.cancel()
          return
        }
        onClose()
      }}
      initialFocus={asked}
      finalFocus={opener}
      slotProps={{
        viewport: {
          className: behindPanel ? `${styles.viewport} ${styles.behind}` : styles.viewport,
        },
      }}
    >
      <Tabs
        value={tab}
        onChange={(_event, value) => {
          if (isTab(value)) mapView.update({ tab: value })
        }}
      >
        <TabsList aria-label={words.title}>
          {SHEET_TABS.map((value) => (
            <Tab key={value} value={value} count={counts[value]}>
              {words[value]}
            </Tab>
          ))}
        </TabsList>
        {SHEET_TABS.map((value) => (
          <TabsPanel key={value} value={value}>
            {PANELS[value]}
          </TabsPanel>
        ))}
      </Tabs>
    </Sheet>
  )
}
