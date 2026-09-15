import { describe, expect, it } from 'vitest'
import {
  computeActivityDuration,
  computeItemCost,
  computeItemQuantity,
  computeSchedule,
  deriveActivities,
  detectConflicts,
  validateBoqItems,
} from './lib/planning'
import type { BoqItem } from './types'

const makeItem = (overrides: Partial<BoqItem> = {}): BoqItem => ({
  id: 'A1',
  code: 'TEST-1',
  section: 'Concrete',
  description: 'Test item',
  unit: 'm3',
  measurement: { length: 10, width: 2, depth: 0.5, count: 2, factor: 1 },
  rate: 100,
  productivityPerDay: 8,
  crew: 'Crew A',
  workFront: 'Zone 1',
  predecessors: [],
  specification: 'Measured net in place',
  ...overrides,
})

describe('planning domain logic', () => {
  it('computes quantity and cost from measured values', () => {
    const item = makeItem()
    expect(computeItemQuantity(item)).toBe(20)
    expect(computeItemCost(item)).toBe(2000)
  })

  it('converts quantity into duration using productivity', () => {
    const item = makeItem({ productivityPerDay: 6 })
    expect(computeActivityDuration(item)).toBe(4)
  })

  it('computes CPM dates and critical path', () => {
    const items = [
      makeItem({ id: 'A', description: 'Start', productivityPerDay: 10 }),
      makeItem({ id: 'B', description: 'Follow', productivityPerDay: 5, predecessors: ['A'] }),
      makeItem({ id: 'C', description: 'Parallel', productivityPerDay: 20, predecessors: ['A'] }),
    ]

    const schedule = computeSchedule(deriveActivities(items))
    const activityB = schedule.activities.find((activity) => activity.id === 'B')
    const activityC = schedule.activities.find((activity) => activity.id === 'C')

    expect(schedule.projectDuration).toBe(6)
    expect(activityB?.critical).toBe(true)
    expect(activityC?.totalFloat).toBe(3)
  })

  it('detects overlapping crew conflicts', () => {
    const items = [
      makeItem({ id: 'A', description: 'A', productivityPerDay: 10 }),
      makeItem({
        id: 'B',
        description: 'B',
        productivityPerDay: 10,
        crew: 'Crew A',
        workFront: 'Zone 2',
      }),
    ]

    const schedule = computeSchedule(deriveActivities(items))
    const conflicts = detectConflicts(schedule.activities)

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].type).toBe('crew')
  })

  it('deduplicates repeated predecessors before CPM analysis', () => {
    const items = [
      makeItem({ id: 'A', description: 'A', productivityPerDay: 10 }),
      makeItem({
        id: 'B',
        description: 'B',
        productivityPerDay: 5,
        predecessors: ['A', 'A'],
      }),
    ]

    const schedule = computeSchedule(deriveActivities(items))

    expect(schedule.hasCycle).toBe(false)
    expect(schedule.projectDuration).toBe(6)
  })

  it('flags validation issues for invalid rows', () => {
    const issues = validateBoqItems([
      makeItem({ description: '', rate: 0, productivityPerDay: 0 }),
    ])

    expect(issues.length).toBeGreaterThanOrEqual(3)
  })

  it('flags unknown predecessor references during validation', () => {
    const issues = validateBoqItems([
      makeItem({ id: 'A', predecessors: ['MISSING'] }),
    ])

    expect(issues.some((issue) => issue.fields.includes('predecessors'))).toBe(true)
  })

  it('treats zero measurement factors as zero quantity when included in the formula', () => {
    const item = makeItem({
      measurement: { length: 10, width: 2, depth: 0.5, count: 0, factor: 1 },
    })

    expect(computeItemQuantity(item)).toBe(0)
  })

  it('preserves zero count or factor behaviour across all supported units', () => {
    expect(
      computeItemQuantity(
        makeItem({
          unit: 'm',
          measurement: { length: 10, width: 0, depth: 0, count: 0, factor: 1 },
        }),
      ),
    ).toBe(0)

    expect(
      computeItemQuantity(
        makeItem({
          unit: 'm2',
          measurement: { length: 10, width: 2, depth: 0, count: 1, factor: 0 },
        }),
      ),
    ).toBe(0)

    expect(
      computeItemQuantity(
        makeItem({
          unit: 'item',
          measurement: { length: 0, width: 0, depth: 0, count: 0, factor: 1 },
        }),
      ),
    ).toBe(0)
  })
})
