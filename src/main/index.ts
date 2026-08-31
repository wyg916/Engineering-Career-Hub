import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { ApplicationServices, registerIpcHandlers } from './ipc'
import { LearningStoreService } from './learning-store'

let mainWindow: BrowserWindow | null = null
let services: ApplicationServices | null = null
let rendererEntryUrl = ''

function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isTrustedRendererNavigation(value: string): boolean {
  try {
    const target = new URL(value)
    const entry = new URL(rendererEntryUrl)
    if (entry.protocol === 'file:') return target.protocol === 'file:' && target.pathname === entry.pathname
    return target.origin === entry.origin
  } catch {
    return false
  }
}

async function openSafeExternal(value: string): Promise<void> {
  if (isSafeExternalUrl(value)) await shell.openExternal(value)
}

function configureWindowSecurity(window: BrowserWindow): void {
  const session = window.webContents.session
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const developmentUrl = process.env.ELECTRON_RENDERER_URL
      if (developmentUrl) {
        try {
          if (new URL(details.url).origin === new URL(developmentUrl).origin) {
            callback({ cancel: false })
            return
          }
        } catch {
          // Invalid URLs are denied below.
        }
      }
      callback({ cancel: true })
    }
  )

  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openSafeExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererNavigation(url)) return
    event.preventDefault()
    void openSafeExternal(url)
  })
}

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    title: '工程经验求职学习中心',
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })
  mainWindow = window
  configureWindowSecurity(window)
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  const developmentUrl = process.env.ELECTRON_RENDERER_URL
  if (developmentUrl) {
    rendererEntryUrl = developmentUrl
    await window.loadURL(developmentUrl)
  } else {
    const rendererFile = join(__dirname, '../renderer/index.html')
    rendererEntryUrl = pathToFileURL(rendererFile).toString()
    await window.loadFile(rendererFile)
  }
  return window
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.wyg.engineeringexperiencestudy')
    const appDataBase = process.env.APPDATA?.trim() || app.getPath('appData')
    const learningStore = new LearningStoreService(join(appDataBase, 'EngineeringExperienceStudyCenter'))
    services = new ApplicationServices(learningStore, getMainWindow)
    registerIpcHandlers(services, getMainWindow)
    await createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
    })
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('应用启动失败', message)
    app.quit()
  })
}

app.on('before-quit', () => {
  if (services) void services.dispose()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
