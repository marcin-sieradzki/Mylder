// The glyphs' one size near and far (ADR 0016): a few lines of shader that keep a billboard's
// outline and pixel offset at exactly their px on the canvas, however the map is tilted, for the
// vehicles' dots (VehicleGlyphLayer.ts) and the aircraft's icons (AircraftGlyphLayer.ts) alike.
import 'client-only'

/**
 * A billboard's size and pixel offset at exactly their px on the canvas, however the map is
 * tilted. deck.gl adds them to the glyph's clip-space position through
 * `project_pixel_size_to_clipspace`, which scales them by the focal distance so that the divide
 * by w gives their px at the canvas's centre only: on a tilted map a near glyph would be drawn
 * bigger and a far one smaller, and a dot's offset, which offsets.ts has already drawn through the
 * camera, foreshortened twice. Scaled by w over the focal distance first, they come out as given.
 */
export const SCREEN_SIZE = 'size.xy *= gl_Position.w / project.focalDistance;\n'

/** The shader module that does it, for a layer whose billboards keep their px. */
export const screenSizeModule = {
  name: 'screenSize',
  inject: { 'vs:DECKGL_FILTER_SIZE': SCREEN_SIZE },
}
