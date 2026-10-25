// The encoded polyline format at five decimals, as map libraries and Google write it: each
// coordinate as the difference from the one before, in base-64 chunks of five bits.

export type LatLon = readonly [lat: number, lon: number]

export function encodePolyline(points: readonly LatLon[]): string {
  let out = ''
  let lastLat = 0
  let lastLon = 0
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e5)
    const lo = Math.round(lon * 1e5)
    out += encodeValue(la - lastLat) + encodeValue(lo - lastLon)
    lastLat = la
    lastLon = lo
  }
  return out
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1
  let out = ''
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
    v >>= 5
  }
  return out + String.fromCharCode(v + 63)
}

export function decodePolyline(encoded: string): LatLon[] {
  const points: LatLon[] = []
  let i = 0
  let lat = 0
  let lon = 0
  const next = () => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(i++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < encoded.length) {
    lat += next()
    lon += next()
    points.push([lat / 1e5, lon / 1e5])
  }
  return points
}
