/**
 * A count as the screens write it, in either language: thousands grouped by a space that doesn't
 * break, "1 046", as docs/screens.md writes them.
 */
export const grouped = (count: number): string =>
  String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
