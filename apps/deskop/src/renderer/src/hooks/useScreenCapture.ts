import { useState, useCallback, useRef } from 'react'

export function useScreenCapture() {
  const [lastCapture, setLastCapture] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const captureOnce = useCallback(async (): Promise<string | null> => {
    try {
      const dataUrl = await window.api.captureScreen()
      if (dataUrl) setLastCapture(dataUrl)
      return dataUrl
    } catch {
      return null
    }
  }, [])

  const startAutoCapture = useCallback((intervalMs: number = 5000) => {
    setCapturing(true)
    captureOnce()
    intervalRef.current = setInterval(captureOnce, intervalMs)
  }, [captureOnce])

  const stopAutoCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setCapturing(false)
  }, [])

  return { lastCapture, capturing, captureOnce, startAutoCapture, stopAutoCapture }
}
