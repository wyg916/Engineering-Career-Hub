import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, KnowledgeSnapshot, LearningAction } from '../shared/types'

const CHANNELS = {
  resolveRoot: 'config:resolve-knowledge-root',
  chooseRoot: 'config:choose-knowledge-root',
  loadSnapshot: 'knowledge:load-snapshot',
  refreshSnapshot: 'knowledge:refresh',
  knowledgeChanged: 'knowledge:changed',
  loadLearningState: 'learning:load-state',
  applyLearningAction: 'learning:apply-action',
  exportLearningState: 'learning:export-state',
  importLearningState: 'learning:import-state',
  revealSourceCard: 'shell:reveal-source-card',
  openExternal: 'shell:open-external'
} as const

const desktopApi: DesktopApi = Object.freeze({
  config: Object.freeze({
    resolveKnowledgeRoot: () => ipcRenderer.invoke(CHANNELS.resolveRoot),
    chooseKnowledgeRoot: () => ipcRenderer.invoke(CHANNELS.chooseRoot)
  }),
  knowledge: Object.freeze({
    loadSnapshot: () => ipcRenderer.invoke(CHANNELS.loadSnapshot),
    refresh: () => ipcRenderer.invoke(CHANNELS.refreshSnapshot),
    onChanged: (listener: (snapshot: KnowledgeSnapshot) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, snapshot: KnowledgeSnapshot): void => listener(snapshot)
      ipcRenderer.on(CHANNELS.knowledgeChanged, wrapped)
      return () => ipcRenderer.removeListener(CHANNELS.knowledgeChanged, wrapped)
    }
  }),
  learning: Object.freeze({
    loadState: () => ipcRenderer.invoke(CHANNELS.loadLearningState),
    applyAction: (action: LearningAction) => ipcRenderer.invoke(CHANNELS.applyLearningAction, action),
    exportState: () => ipcRenderer.invoke(CHANNELS.exportLearningState),
    importState: () => ipcRenderer.invoke(CHANNELS.importLearningState)
  }),
  shell: Object.freeze({
    revealSourceCard: (relativePath: string) => ipcRenderer.invoke(CHANNELS.revealSourceCard, relativePath),
    openExternal: (url: string) => ipcRenderer.invoke(CHANNELS.openExternal, url)
  })
})

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
