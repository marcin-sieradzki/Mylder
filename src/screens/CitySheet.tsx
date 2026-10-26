'use client'

import { Sheet, Tab, Tabs, TabsList, TabsPanel } from '@mylder/perron'
import type { RefObject } from 'react'
import { useI18n } from '../i18n/useI18n'
import { useSnapshot } from '../map/live'
import { mapView, SHEET_TABS, useHiddenModes, useSheetTab, type SheetTab } from '../map/view'
import { CityPulse } from './CityPulse'
import styles from './CitySheet.module.css'

interface CitySheetProps {
  /** Where the sheet sits: beside the map on a desktop, at the bottom on a phone. */
  anchor: 'left' | 'bottom'
  /** Whether the sheet is open. */
  open: boolean
  /** Called when the sheet asks to close. */
  onClose: () => void
  /** Whether a press opened it, so focus moves into it; the page opens it without moving focus. */
  asked: boolean
  /** Where focus goes once it closes: the button that opens it again. */
  opener: RefObject<HTMLButtonElement | null>
}

const isTab = (value: string | null): value is SheetTab =>
  (SHEET_TABS as readonly (string | null)[]).includes(value)

/**
 * The sheet beside the map (docs/screens.md): City pulse, the Vehicles list and Disruptions as
 * tabs, in a side sheet on a desktop and a bottom sheet with a peek on a phone. The open tab is
 * kept in the address.
 */
export function CitySheet({ anchor, open, onClose, asked, opener }: CitySheetProps) {
  const { dictionary } = useI18n()
  const words = dictionary.sheet
  const tab = useSheetTab()
  const hidden = useHiddenModes()
  const snapshot = useSnapshot()
  // The Vehicles tab counts the trips on the map after the filters.
  const vehicles = snapshot?.trips.filter((trip) => !trip.cancelled && !hidden.has(trip.mode))

  return (
    <Sheet
      anchor={anchor}
      title={words.title}
      open={open}
      onClose={onClose}
      initialFocus={asked}
      finalFocus={opener}
      slotProps={{ viewport: { className: styles.viewport } }}
    >
      <Tabs
        value={tab}
        onChange={(_event, value) => {
          if (isTab(value)) mapView.update({ tab: value })
        }}
      >
        <TabsList aria-label={words.title}>
          <Tab value="pulse">{words.pulse}</Tab>
          <Tab value="vehicles" count={vehicles?.length}>
            {words.vehicles}
          </Tab>
          <Tab value="disruptions">{words.disruptions}</Tab>
        </TabsList>
        <TabsPanel value="pulse">
          <CityPulse />
        </TabsPanel>
        {/* The Vehicles list (#76) and Disruptions (#77) fill their tabs in their own tickets. */}
        <TabsPanel value="vehicles" />
        <TabsPanel value="disruptions" />
      </Tabs>
    </Sheet>
  )
}
