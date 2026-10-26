// Node's `join`, as far as the tracker's modules use it: the segments of a path with one slash
// between them.
export const join = (...segments: string[]): string =>
  segments
    .filter((segment) => segment !== '')
    .join('/')
    .replace(/\/+/g, '/')
