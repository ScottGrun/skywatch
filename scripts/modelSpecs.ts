// Source models from github.com/Flightradar24/fr24-3d-models (GPL-2.0) and how to bake them.

export interface RotorRule {
  /** Node names (incl. descendants) that make up one spinning part; removed from the mesh. */
  re: RegExp
  /** Spin axis of the part. */
  axis: 'x' | 'y' | 'z'
  rate: number // rad/s
}

export interface ModelSpec {
  tris: number
  rotors?: RotorRule[]
  /** Invert the detected nose direction (when the fin-tip heuristic is wrong). */
  flip?: boolean
  /** Name pattern of parts to drop from the mesh (gear, doors, ...). */
  drop?: RegExp
}

const J = 3000
export const MODELS: Record<string, ModelSpec> = {
  a318: { tris: J },
  a319: { tris: J },
  a320: { tris: J },
  a321: { tris: J },
  a332: { tris: 3500 },
  a333: { tris: 3500 },
  a343: { tris: 3800 },
  a346: { tris: 3800 },
  a359: { tris: 3500 },
  a380: { tris: 4000 },
  b736: { tris: J },
  b737: { tris: J },
  b738: { tris: J },
  b739: { tris: J },
  b744: { tris: 4000 },
  b748: { tris: 4000 },
  b752: { tris: 3200 },
  b753: { tris: 3200 },
  b762: { tris: 3500 },
  b763: { tris: 3500 },
  b764: { tris: 3500 },
  b772: { tris: 3500 },
  b773: { tris: 3500 },
  b788: { tris: 3500 },
  b789: { tris: 3500 },
  bae146: { tris: 2500 },
  citation: { tris: 2200 },
  crj700: { tris: 2800 },
  crj900: { tris: 2800 },
  cs100: { tris: J },
  cs300: { tris: J },
  e170: { tris: 2800 },
  e190: { tris: 2800 },
  atr42: {
    tris: 2800,
    rotors: [
      { re: /^Prop1$/, axis: 'z', rate: 30 },
      { re: /^Prop2$/, axis: 'z', rate: 30 },
    ],
  },
  q400: {
    tris: 2800,
    rotors: [
      { re: /^propL$/, axis: 'z', rate: 30 },
      { re: /^propR$/, axis: 'z', rate: 30 },
    ],
  },
  pa28: { tris: 2200, rotors: [{ re: /^(helice|propblur|propdisc)$/, axis: 'z', rate: 34 }] },
  heli: {
    tris: 2800,
    rotors: [
      { re: /^(blade\d|blurred\d)/i, axis: 'y', rate: 14 },
      { re: /^(Tblade|rotor_disc_T)$/, axis: 'x', rate: 26 },
    ],
  },
}
