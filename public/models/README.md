# Aircraft models

These `.glb` files are derived from the [Flightradar24 3D models](https://github.com/Flightradar24/fr24-3d-models)
(`/models`), which are licensed under the GNU General Public License v2 (see `LICENSE` in this directory).

Many thanks to the [FlightGear project](http://www.flightgear.org/) and the
[FGMEMBERS](https://github.com/FGMEMBERS) repositories, whose aircraft the Flightradar24 models are based on:

| Models                 | Original aircraft                                                       |
| ---------------------- | ----------------------------------------------------------------------- |
| b736, b737, b739       | https://github.com/FGMEMBERS/737NG                                      |
| b738                   | https://github.com/FGMEMBERS/737-800                                    |
| b744                   | https://github.com/FGMEMBERS/747-400                                    |
| b748                   | https://github.com/FGMEMBERS/747-8i                                     |
| b752, b753             | https://github.com/FGMEMBERS/757-200                                    |
| b762, b764             | https://github.com/FGMEMBERS/767                                        |
| b763                   | https://github.com/FGMEMBERS/767-300                                    |
| b772, b773             | https://github.com/FGMEMBERS/777                                        |
| b788                   | https://github.com/FGMEMBERS/787-8                                      |
| b789                   | https://github.com/FGMEMBERS/787-9                                      |
| a318, a319, a320, a321 | https://github.com/FGMEMBERS/A320-family                                |
| a332                   | https://github.com/FGMEMBERS/A330-200                                   |
| a333                   | https://github.com/FGMEMBERS/A330-300                                   |
| a343                   | https://github.com/FGMEMBERS/A340-313X                                  |
| a346                   | https://github.com/FGMEMBERS/A340-600HGW                                |
| a359                   | https://github.com/FGMEMBERS/A350XWB                                    |
| a380                   | https://github.com/FGMEMBERS/A380-omega                                 |
| atr42                  | https://github.com/FGMEMBERS/ATR-42-500                                 |
| citation               | https://github.com/FGMEMBERS/Citation                                   |
| pa28                   | https://github.com/FGMEMBERS/Piper-PA-28                                |
| crj700, crj900         | https://github.com/FGMEMBERS/CRJ700-family                              |
| e170, e190             | https://github.com/FGMEMBERS/E-jet-family                               |
| heli                   | https://github.com/FGMEMBERS/ec135                                      |
| cs100, cs300           | https://github.com/FGMEMBERS/CSeries                                    |
| q400                   | https://github.com/FGMEMBERS/Q400                                       |
| bae146                 | https://github.com/FGMEMBERS/Jumbolino                                  |

## Modifications

The files here are **modified** versions of the originals. They were converted from glTF 1.0 to 2.0,
stripped of textures, materials, animations and hierarchy, merged into a single mesh, welded,
simplified to roughly 2k-4k triangles, quantized (14-bit positions), meshopt-compressed, normalized to
length 1 (nose toward -Z, up +Y) and centered. Propellers and rotors were removed and are recorded in
the scene `extras` (position, axis, radius, rate) so the app can draw spinning overlays.

Regenerate with `pnpm bake:models` (downloads the originals into the gitignored `.cache/`; see
`scripts/build-models.ts`). The source for these files is available in this repository and upstream.
