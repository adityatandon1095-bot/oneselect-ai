import { useState, useEffect } from 'react'

export function usePersistentState(key, defaultValue, replacer = null) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state, replacer))
    } catch {
      // localStorage full or unavailable — fail silently
    }
  }, [key, state])

  return [state, setState]
}
