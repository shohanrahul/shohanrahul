export type MeasurementField = 'length' | 'width' | 'depth' | 'count' | 'factor'

export type ScaleMode = 'day' | 'week'

export interface MeasurementInput {
  length: number
  width: number
  depth: number
  count: number
  factor: number
}

export interface BoqItem {
  id: string
  code: string
  section: string
  description: string
  unit: 'm' | 'm2' | 'm3' | 'item'
  measurement: MeasurementInput
  rate: number
  productivityPerDay: number
  crew: string
  workFront: string
  predecessors: string[]
  specification: string
}

export interface ProjectAssumptions {
  projectName: string
  location: string
  currency: string
  workingHoursPerDay: number
  workingDaysPerWeek: number
  overheadPct: number
  contingencyPct: number
  startDate: string
  standards: string[]
}

export interface RevisionEntry {
  id: string
  timestamp: string
  action: string
  entity: string
  summary: string
}

export interface ProjectState {
  assumptions: ProjectAssumptions
  items: BoqItem[]
  revisions: RevisionEntry[]
}

export interface Activity {
  id: string
  itemId: string
  name: string
  quantity: number
  cost: number
  duration: number
  predecessors: string[]
  crew: string
  workFront: string
  specification: string
}

export interface ScheduledActivity extends Activity {
  earliestStart: number
  earliestFinish: number
  latestStart: number
  latestFinish: number
  totalFloat: number
  critical: boolean
}

export interface ScheduleResult {
  activities: ScheduledActivity[]
  projectDuration: number
  hasCycle: boolean
}

export interface Conflict {
  type: 'crew' | 'work-front' | 'crew and work-front'
  reason: string
  activityIds: [string, string]
  overlapStart: number
  overlapFinish: number
}

export interface ValidationIssue {
  itemId: string
  fields: string[]
  message: string
}
