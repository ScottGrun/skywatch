/** Resolves on the next animation frame (or after 250 ms in a hidden tab), so queued work runs once per frame with a ms budget. */
export function nextFrame(): Promise<void> {
  return new Promise((res) => {
    const t = setTimeout(res, 250)
    requestAnimationFrame(() => {
      clearTimeout(t)
      res()
    })
  })
}
