// Collects real-time system context: OS info, active app, running apps, time

export interface SystemSnapshot {
  // Machine
  username: string
  hostname: string
  os: string
  osRelease: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMemGb: string
  freeMemGb: string
  screenResolution: string
  timezone: string

  // Session
  currentTime: string
  currentDate: string
  activeApp: string | null
  activeWindowTitle: string | null
  runningApps: string[]
}

let cachedSnapshot: SystemSnapshot | null = null
let cacheTs = 0
const CACHE_TTL_MS = 10_000  // refresh every 10s

export async function getSystemSnapshot(forceRefresh = false): Promise<SystemSnapshot> {
  if (!forceRefresh && cachedSnapshot && Date.now() - cacheTs < CACHE_TTL_MS) {
    // Still update time and active window (cheap)
    cachedSnapshot.currentTime = new Date().toLocaleTimeString()
    cachedSnapshot.currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    try {
      const aw = await window.api.system.getActiveWindow()
      cachedSnapshot.activeApp = aw?.appName || null
      cachedSnapshot.activeWindowTitle = aw?.windowTitle || null
    } catch { /* non-fatal */ }
    return cachedSnapshot
  }

  const [info, activeWindow, runningApps] = await Promise.all([
    window.api.system.getInfo(),
    window.api.system.getActiveWindow().catch(() => null),
    window.api.system.getRunningApps().catch(() => [] as string[])
  ])

  const now = new Date()
  cachedSnapshot = {
    username: info.username,
    hostname: info.hostname,
    os: info.os,
    osRelease: info.osRelease,
    arch: info.arch,
    cpuModel: info.cpuModel,
    cpuCores: info.cpuCores,
    totalMemGb: info.totalMemGb,
    freeMemGb: info.freeMemGb,
    screenResolution: `${info.screenWidth}×${info.screenHeight}${info.scaleFactor > 1 ? ` @${info.scaleFactor}x` : ''}`,
    timezone: info.timezone,
    currentTime: now.toLocaleTimeString(),
    currentDate: now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }),
    activeApp: activeWindow?.appName || null,
    activeWindowTitle: activeWindow?.windowTitle || null,
    runningApps
  }
  cacheTs = Date.now()
  return cachedSnapshot
}

export function formatSystemContext(s: SystemSnapshot): string {
  const lines: string[] = [
    `## System`,
    `- User: ${s.username} on ${s.hostname}`,
    `- OS: ${s.os} ${s.osRelease} (${s.arch})`,
    `- CPU: ${s.cpuModel} (${s.cpuCores} cores)`,
    `- Memory: ${s.freeMemGb}GB free / ${s.totalMemGb}GB total`,
    `- Display: ${s.screenResolution}`,
    `- Timezone: ${s.timezone}`,
    ``,
    `## Right Now`,
    `- Date/Time: ${s.currentDate}, ${s.currentTime}`,
  ]

  if (s.activeApp) {
    lines.push(`- Active app: ${s.activeApp}${s.activeWindowTitle ? ` — "${s.activeWindowTitle}"` : ''}`)
  }

  if (s.runningApps.length > 0) {
    // Filter out Oni itself and system processes
    const filtered = s.runningApps.filter(a =>
      !['Oni', 'SystemUIServer', 'Dock', 'Finder', 'loginwindow'].includes(a)
    )
    if (filtered.length > 0) {
      lines.push(`- Open apps: ${filtered.slice(0, 10).join(', ')}`)
    }
  }

  return lines.join('\n')
}
