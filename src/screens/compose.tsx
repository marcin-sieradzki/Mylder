import { Fragment, type ReactNode } from 'react'

const PLACEHOLDERS = /(\{\w+\})/
const PLACEHOLDER = /^\{(\w+)\}$/

/** Fills each `{name}` in `template` with its part, which may be an element such as a link. */
export function compose(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  return template.split(PLACEHOLDERS).map((piece, i) => {
    const name = PLACEHOLDER.exec(piece)?.[1]
    return name !== undefined && name in parts ? <Fragment key={i}>{parts[name]}</Fragment> : piece
  })
}
