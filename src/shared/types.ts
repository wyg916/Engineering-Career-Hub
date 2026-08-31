export type ContentKind = 'card' | 'project' | 'interview' | 'review' | 'learning'

export type LearningStatus = 'new' | 'learning' | 'reviewing' | 'mastered'
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface KnowledgeSection {
  level: number
  title: string
  slug: string
  content: string
}

export interface KnowledgeCard {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  project: string
  domain: string
  type: string
  status: string
  verification: string
  impact: number
  diagnosisDepth: number
  technicalDepth: number
  experienceScore: number
  difficulty: number
  learningValue: number
  interviewValue: number
  reusability: number
  tags: string[]
  related: string[]
  sections: KnowledgeSection[]
  markdown: string
  plainText: string
  relativePath: string
}

export interface KnowledgeDocument {
  id: string
  kind: ContentKind
  title: string
  markdown: string
  plainText: string
  relativePath: string
  updatedAt: string
}

export interface KnowledgeDiagnostic {
  relativePath: string
  severity: 'warning' | 'error'
  message: string
}

export interface KnowledgeStats {
  cardCount: number
  projectCount: number
  domainCount: number
  interviewCandidateCount: number
  documentCount: number
  byDomain: Record<string, number>
  byProject: Record<string, number>
}

export interface KnowledgeSnapshot {
  root: string
  cards: KnowledgeCard[]
  documents: KnowledgeDocument[]
  diagnostics: KnowledgeDiagnostic[]
  stats: KnowledgeStats
  scannedAt: string
}

export interface CardLearningState {
  cardId: string
  status: LearningStatus
  favorite: boolean
  confidence: number
  box: number
  nextReviewAt: string | null
  lastReviewedAt: string | null
  note: string
  reviewCount: number
  updatedAt: string
}

export interface ReviewEvent {
  id: string
  cardId: string
  rating: ReviewRating
  reviewedAt: string
  previousBox: number
  nextBox: number
  nextReviewAt: string
  mode: 'study' | 'interview'
}

export interface AppSettings {
  knowledgeRoot: string | null
  onboardingCompleted: boolean
  theme: ThemeMode
  fontScale: number
  wideReading: boolean
  dailyMinutes: number
  dailyNewCards: number
  interviewDate: string | null
  focusProjects: string[]
  focusDomains: string[]
}

export interface LearningStore {
  version: 1
  settings: AppSettings
  cards: Record<string, CardLearningState>
  reviews: ReviewEvent[]
  studyDays: string[]
  lastBackupAt: string | null
}

export type LearningAction =
  | { type: 'toggle-favorite'; cardId: string }
  | { type: 'set-note'; cardId: string; note: string }
  | { type: 'set-status'; cardId: string; status: LearningStatus }
  | { type: 'set-confidence'; cardId: string; confidence: number }
  | { type: 'review'; cardId: string; rating: ReviewRating; mode: 'study' | 'interview'; now?: string }
  | { type: 'update-settings'; patch: Partial<AppSettings> }
  | { type: 'complete-onboarding'; patch: Partial<AppSettings> }

export interface RootResolution {
  root: string | null
  source: 'stored' | 'codex-config' | 'fallback' | 'manual' | 'none'
  valid: boolean
  message: string
}

export interface ExportResult {
  ok: boolean
  path?: string
  message: string
}

export interface ImportResult {
  ok: boolean
  importedCards: number
  message: string
}

export interface DesktopApi {
  config: {
    resolveKnowledgeRoot: () => Promise<RootResolution>
    chooseKnowledgeRoot: () => Promise<RootResolution>
  }
  knowledge: {
    loadSnapshot: () => Promise<KnowledgeSnapshot>
    refresh: () => Promise<KnowledgeSnapshot>
    onChanged: (listener: (snapshot: KnowledgeSnapshot) => void) => () => void
  }
  learning: {
    loadState: () => Promise<LearningStore>
    applyAction: (action: LearningAction) => Promise<LearningStore>
    exportState: () => Promise<ExportResult>
    importState: () => Promise<ImportResult>
  }
  shell: {
    revealSourceCard: (relativePath: string) => Promise<boolean>
    openExternal: (url: string) => Promise<boolean>
  }
}
