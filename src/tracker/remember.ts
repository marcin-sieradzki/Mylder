// A value built once and kept, such as a runtime: built at the first ask, and forgotten when its
// build fails, such as on a timetable that can't be read, so the next ask tries again.
import 'server-only'
import { type Layer, ManagedRuntime } from 'effect'

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

/**
 * A runtime of the layer `buildLayer` gives, built at the first call and kept, unless the build fails.
 * Its layer is built then too, not at its first use: a runtime keeps a layer that failed to build,
 * such as on a recording whose files can't be read, failing every use, so the failure must reach
 * `remember` for the next call to build it again.
 */
export function rememberRuntime<R, E>(
  buildLayer: () => Promise<Layer.Layer<R, E>>,
): () => Promise<ManagedRuntime.ManagedRuntime<R, E>> {
  return remember(async () => {
    const runtime = ManagedRuntime.make(await buildLayer())
    try {
      await runtime.context()
    } catch (error) {
      await runtime.dispose()
      throw error
    }
    return runtime
  })
}
