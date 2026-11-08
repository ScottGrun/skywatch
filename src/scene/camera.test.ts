import { describe, expect, it } from 'vitest'
import { CameraRig } from './camera'

describe('CameraRig', () => {
  it('keeps idle orbit and follow through zoom, stops orbit on drag/pan', () => {
    const rig = new CameraRig()
    rig.home()
    rig.zoom(-120)
    expect(rig.autoOrbit).toBe(true)
    rig.setFollowing(true)
    rig.zoom(80)
    expect(rig.following).toBe(true)
    rig.autoOrbit = true
    rig.orbit(5, 0)
    expect(rig.autoOrbit).toBe(false)
    rig.autoOrbit = true
    rig.pan(3, 3)
    expect(rig.autoOrbit).toBe(false)
  })
})
