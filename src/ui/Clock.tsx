import { useEffect, useState } from 'react'

export function Clock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="clock">{t.toISOString().slice(11, 19)} UTC</span>
}
