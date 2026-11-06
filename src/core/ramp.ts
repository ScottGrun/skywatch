/** Altitude (ft) to color ramp, ported from design/flight-scene.js. */
export const RAMP: ReadonlyArray<readonly [number, number]> = [
  [0, 0xffb020],
  [5000, 0xb6f03c],
  [12000, 0x2ff0c0],
  [22000, 0x3cb8ff],
  [32000, 0x9a7bff],
  [42000, 0xff5ad8],
]

function lerpHex(a: number, b: number, t: number): number {
  const c = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t)
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

export function rampHex(alt: number): number {
  if (alt <= 0) return RAMP[0][1]
  for (let i = 1; i < RAMP.length; i++) {
    if (alt <= RAMP[i][0]) {
      const [a0, c0] = RAMP[i - 1]
      const [a1, c1] = RAMP[i]
      return lerpHex(c0, c1, (alt - a0) / (a1 - a0))
    }
  }
  return RAMP[RAMP.length - 1][1]
}

export const hexCss = (h: number): string => '#' + h.toString(16).padStart(6, '0')
