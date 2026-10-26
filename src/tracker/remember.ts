// A value built once and kept, such as a runtime: built at the first ask, and forgotten when its
// build fails, such as on a timetable that can't be read, so the next ask tries again.
import 'server-only'

/** What `build` gives, built at the first call and kept, unless the build fails. */
export function remember<A>(build: () => Promise<A>): () => Promise<A> {
  let built: Promise<A> | undefined
  return () => {
    if (built) return built
    const building = build()
    built = building
    building.catch(() => {
      if (built === building) built = undefined
    })
    return building
  }
}
