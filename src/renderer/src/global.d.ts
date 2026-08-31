import type { DesktopApi } from '@shared/types'

declare module '*.css'

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
