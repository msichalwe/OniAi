import { useState, useRef, useCallback, useEffect } from 'react'

export function useCamera() {
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)          // true once video is playing
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    canvasRef.current = document.createElement('canvas')
    return () => { stopCamera() }
  }, [])

  // KEY FIX: attach stream AFTER React renders the <video> element
  // startCamera() runs before CameraPreview mounts, so videoRef.current is null at that point.
  // This effect runs after every render where active=true and wires the stream.
  useEffect(() => {
    if (!active || !streamRef.current) {return}
    const video = videoRef.current
    if (!video) {return}
    video.srcObject = streamRef.current
    video.onloadedmetadata = () => {
      video.play().catch(console.error)
      setReady(true)
    }
  }, [active])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      })
      streamRef.current = stream
      setReady(false)
      setActive(true)   // triggers the useEffect above after re-render
      setError(null)
    } catch (e) {
      setError('Camera access denied')
      console.error(e)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.onloadedmetadata = null
    }
    setActive(false)
    setReady(false)
  }, [])

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !active) {return null}

    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) {return null}   // video not ready yet — don't send blank frame

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {return null}
    ctx.drawImage(video, 0, 0)

    // Sanity check: if image is all black (camera not ready), skip
    const sample = ctx.getImageData(w / 2, h / 2, 1, 1).data
    if (sample[0] === 0 && sample[1] === 0 && sample[2] === 0) {return null}

    return canvas.toDataURL('image/jpeg', 0.8)
  }, [active])

  return { active, ready, error, videoRef, startCamera, stopCamera, captureFrame }
}
