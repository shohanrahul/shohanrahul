import type {
  Activity,
  BoqItem,
  Conflict,
  ProjectAssumptions,
  ScheduleResult,
  ScheduledActivity,
  ValidationIssue,
} from '../types'

const round = (value: number, digits = 2) => Number.parseFloat(value.toFixed(digits))

const localDateFromInput = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export const computeItemQuantity = (item: BoqItem) => {
  const { count, depth, factor, length, width } = item.measurement

  switch (item.unit) {
    case 'm':
      return round(length * count * factor)
    case 'm2':
      return round(length * width * count * factor)
    case 'm3':
      return round(length * width * depth * count * factor)
    case 'item':
      return round(count * factor)
  }
}

export const computeItemCost = (item: BoqItem) =>
  round(computeItemQuantity(item) * item.rate)

export const computeActivityDuration = (item: BoqItem) => {
  const quantity = computeItemQuantity(item)
  if (quantity <= 0 || item.productivityPerDay <= 0) {
    return 0
  }

  return Math.max(1, Math.ceil(quantity / item.productivityPerDay))
}

export const validateBoqItems = (items: BoqItem[]) => {
  const itemIds = new Set(items.map((candidate) => candidate.id))

  return items.flatMap<ValidationIssue>((item) => {
    const issues: ValidationIssue[] = []

    if (!item.description.trim()) {
      issues.push({
        itemId: item.id,
        fields: ['description'],
        message: 'Description is required for traceable BOQ rows.',
      })
    }

    if (computeItemQuantity(item) <= 0) {
      issues.push({
        itemId: item.id,
        fields: ['measurement'],
        message: 'At least one positive measured quantity is required.',
      })
    }

    if (item.rate <= 0) {
      issues.push({
        itemId: item.id,
        fields: ['rate'],
        message: 'Unit rate must be greater than zero.',
      })
    }

    if (item.productivityPerDay <= 0) {
      issues.push({
        itemId: item.id,
        fields: ['productivityPerDay'],
        message: 'Productivity per day must be greater than zero.',
      })
    }

    if (!item.crew.trim() || !item.workFront.trim()) {
      issues.push({
        itemId: item.id,
        fields: ['crew', 'workFront'],
        message: 'Crew and work-front are required for conflict detection.',
      })
    }

    const missingPredecessors = [...new Set(item.predecessors)].filter(
      (predecessor) => !itemIds.has(predecessor),
    )

    if (missingPredecessors.length) {
      issues.push({
        itemId: item.id,
        fields: ['predecessors'],
        message: `Unknown predecessor reference(s): ${missingPredecessors.join(', ')}.`,
      })
    }

    return issues
  })
}

export const deriveActivities = (items: BoqItem[]): Activity[] =>
  items.map((item) => ({
    id: item.id,
    itemId: item.id,
    name: item.description,
    quantity: computeItemQuantity(item),
    cost: computeItemCost(item),
    duration: computeActivityDuration(item),
    predecessors: item.predecessors,
    crew: item.crew,
    workFront: item.workFront,
    specification: item.specification,
  }))

export const computeSchedule = (activities: Activity[]): ScheduleResult => {
  if (!activities.length) {
    return { activities: [], projectDuration: 0, hasCycle: false }
  }

  const activityMap = new Map(activities.map((activity) => [activity.id, activity]))
  const indegree = new Map(activities.map((activity) => [activity.id, 0]))
  const successors = new Map<string, string[]>(
    activities.map((activity) => [activity.id, []]),
  )

  activities.forEach((activity) => {
    const uniquePredecessors = [...new Set(activity.predecessors)]

    uniquePredecessors.forEach((predecessor) => {
      if (!activityMap.has(predecessor)) {
        return
      }

      indegree.set(activity.id, (indegree.get(activity.id) ?? 0) + 1)
      successors.set(predecessor, [
        ...(successors.get(predecessor) ?? []),
        activity.id,
      ])
    })
  })

  const queue = activities
    .filter((activity) => (indegree.get(activity.id) ?? 0) === 0)
    .map((activity) => activity.id)
  const topoOrder: string[] = []

  while (queue.length) {
    const currentId = queue.shift()!
    topoOrder.push(currentId)

    ;(successors.get(currentId) ?? []).forEach((successorId) => {
      const nextIndegree = (indegree.get(successorId) ?? 0) - 1
      indegree.set(successorId, nextIndegree)

      if (nextIndegree === 0) {
        queue.push(successorId)
      }
    })
  }

  if (topoOrder.length !== activities.length) {
    return { activities: [], projectDuration: 0, hasCycle: true }
  }

  const earliest = new Map<string, { start: number; finish: number }>()

  topoOrder.forEach((activityId) => {
    const activity = activityMap.get(activityId)!
    const start = [...new Set(activity.predecessors)].reduce((latestFinish, predecessor) => {
      return Math.max(latestFinish, earliest.get(predecessor)?.finish ?? 0)
    }, 0)

    earliest.set(activityId, {
      start,
      finish: start + activity.duration,
    })
  })

  const projectDuration = Math.max(
    ...Array.from(earliest.values(), (window) => window.finish),
  )
  const latest = new Map<string, { start: number; finish: number }>()

  ;[...topoOrder].reverse().forEach((activityId) => {
    const activity = activityMap.get(activityId)!
    const downstream = successors.get(activityId) ?? []
    const finish =
      downstream.length === 0
        ? projectDuration
        : Math.min(...downstream.map((id) => latest.get(id)?.start ?? projectDuration))

    latest.set(activityId, {
      finish,
      start: finish - activity.duration,
    })
  })

  const scheduled = activities.map<ScheduledActivity>((activity) => {
    const early = earliest.get(activity.id)!
    const late = latest.get(activity.id)!
    const totalFloat = late.start - early.start

    return {
      ...activity,
      earliestStart: early.start,
      earliestFinish: early.finish,
      latestStart: late.start,
      latestFinish: late.finish,
      totalFloat,
      critical: totalFloat === 0,
    }
  })

  return {
    activities: scheduled.sort((left, right) => left.earliestStart - right.earliestStart),
    projectDuration,
    hasCycle: false,
  }
}

export const detectConflicts = (activities: ScheduledActivity[]): Conflict[] => {
  const conflicts: Conflict[] = []

  for (let index = 0; index < activities.length; index += 1) {
    for (let next = index + 1; next < activities.length; next += 1) {
      const current = activities[index]
      const candidate = activities[next]
      const overlapStart = Math.max(current.earliestStart, candidate.earliestStart)
      const overlapFinish = Math.min(current.earliestFinish, candidate.earliestFinish)

      if (overlapStart >= overlapFinish) {
        continue
      }

      const sameCrew = current.crew === candidate.crew
      const sameWorkFront = current.workFront === candidate.workFront

      if (!sameCrew && !sameWorkFront) {
        continue
      }

      const type = sameCrew && sameWorkFront
        ? 'crew and work-front'
        : sameCrew
          ? 'crew'
          : 'work-front'

      conflicts.push({
        type,
        reason: `${current.id} overlaps ${candidate.id} on ${type}.`,
        activityIds: [current.id, candidate.id],
        overlapStart,
        overlapFinish,
      })
    }
  }

  return conflicts
}

export const summarizeProject = (
  assumptions: ProjectAssumptions,
  activities: Activity[],
) => {
  const directCost = round(
    activities.reduce((total, activity) => total + activity.cost, 0),
  )
  const overhead = round((directCost * assumptions.overheadPct) / 100)
  const contingency = round((directCost * assumptions.contingencyPct) / 100)
  const grandTotal = round(directCost + overhead + contingency)
  const workingHoursPerWeek = round(
    assumptions.workingHoursPerDay * assumptions.workingDaysPerWeek,
    1,
  )
  const plannedWorkHours = round(
    activities.reduce(
      (total, activity) => total + activity.duration * assumptions.workingHoursPerDay,
      0,
    ),
    1,
  )

  return {
    directCost,
    overhead,
    contingency,
    grandTotal,
    workingHoursPerWeek,
    plannedWorkHours,
    rowCount: activities.length,
  }
}

export const dayToDateLabel = (startDate: string, dayOffset: number) => {
  const date = localDateFromInput(startDate)
  date.setDate(date.getDate() + dayOffset)
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })
}
