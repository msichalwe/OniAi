import { RefObject } from 'react'

interface Props {
  cameraActive: boolean
  cameraReady: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  screenCapture: string | null
  onCameraClose: () => void
}

export function MediaPanel({ cameraActive, cameraReady, videoRef, screenCapture, onCameraClose }: Props) {
  if (!cameraActive && !screenCapture) {return null}

  return (
    <div className="w-72 border-l border-[var(--border-light)] flex flex-col flex-shrink-0 bg-[var(--bg-secondary)] overflow-y-auto">
      {cameraActive && (
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${cameraReady ? 'bg-[var(--error)] animate-pulse' : 'bg-[var(--warning)]'}`} />
              <span className="text-[var(--text-secondary)] text-xs font-medium">{cameraReady ? 'Camera Live' : 'Starting...'}</span>
            </div>
            <button onClick={onCameraClose} className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-[var(--border)] bg-black aspect-[4/3]">
            <video ref={videoRef as RefObject<HTMLVideoElement>} autoPlay muted playsInline className="w-full h-full object-cover" />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}

      {screenCapture && (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[var(--text-secondary)] text-xs font-medium">Screen Preview</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-black">
            <img src={screenCapture} alt="Screen" className="w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
