import { useMemo, useReducer, useState } from 'react'
import './App.css'
import { initialProjectState } from './data/sampleProject'
import {
  computeItemCost,
  computeItemQuantity,
  computeSchedule,
  dayToDateLabel,
  deriveActivities,
  detectConflicts,
  summarizeProject,
  validateBoqItems,
} from './lib/planning'
import type {
  BoqItem,
  MeasurementField,
  ProjectState,
  RevisionEntry,
  ScaleMode,
} from './types'

type AssumptionTextField = 'projectName' | 'location' | 'currency' | 'startDate'
type AssumptionNumberField =
  | 'workingHoursPerDay'
  | 'workingDaysPerWeek'
  | 'overheadPct'
  | 'contingencyPct'
type ItemTextField =
  | 'code'
  | 'section'
  | 'description'
  | 'crew'
  | 'workFront'
  | 'specification'
type ItemNumberField = 'rate' | 'productivityPerDay'

type ReducerAction =
  | { type: 'update-assumption-text'; field: AssumptionTextField; value: string }
  | { type: 'update-assumption-number'; field: AssumptionNumberField; value: number }
  | { type: 'update-item-text'; id: string; field: ItemTextField; value: string }
  | { type: 'update-item-number'; id: string; field: ItemNumberField; value: number }
  | { type: 'update-item-unit'; id: string; value: BoqItem['unit'] }
  | { type: 'update-item-predecessors'; id: string; value: string }
  | { type: 'update-measurement'; id: string; field: MeasurementField; value: number }
  | { type: 'add-item' }
  | { type: 'remove-item'; id: string }
  | { type: 'reset-example' }

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

const createRevision = (
  action: string,
  entity: string,
  summary: string,
): RevisionEntry => ({
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  action,
  entity,
  summary,
})

const appendRevision = (state: ProjectState, revision: RevisionEntry): ProjectState => ({
  ...state,
  revisions: [revision, ...state.revisions].slice(0, 30),
})

const newItemTemplate = (nextIndex: number): BoqItem => ({
  id: `I-${200 + nextIndex}`,
  code: `NEW-${nextIndex}`,
  section: 'New Work',
  description: 'New BOQ item',
  unit: 'm3',
  measurement: { length: 1, width: 1, depth: 1, count: 1, factor: 1 },
  rate: 1000,
  productivityPerDay: 10,
  crew: 'New Crew',
  workFront: 'Zone C',
  predecessors: [],
  specification: 'Add traceable measurement and specification note.',
})

const reducer = (state: ProjectState, action: ReducerAction): ProjectState => {
  switch (action.type) {
    case 'update-assumption-text':
    case 'update-assumption-number': {
      const nextState: ProjectState = {
        ...state,
        assumptions: {
          ...state.assumptions,
          [action.field]: action.value,
        },
      }

      return appendRevision(
        nextState,
        createRevision(
          'Updated assumption',
          String(action.field),
          `Changed ${String(action.field)} to ${action.value}.`,
        ),
      )
    }

    case 'update-item-text':
    case 'update-item-number': {
      const nextState: ProjectState = {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id
            ? {
                ...item,
                [action.field]: action.value,
              }
            : item,
        ),
      }

      return appendRevision(
        nextState,
        createRevision(
          'Updated BOQ row',
          action.id,
          `Changed ${action.field} for ${action.id}.`,
        ),
      )
    }

    case 'update-item-unit': {
      const nextState: ProjectState = {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, unit: action.value } : item,
        ),
      }

      return appendRevision(
        nextState,
        createRevision('Updated BOQ row', action.id, `Changed unit for ${action.id}.`),
      )
    }

    case 'update-item-predecessors': {
      const nextState: ProjectState = {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id
            ? {
                ...item,
                predecessors: action.value
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              }
            : item,
        ),
      }

      return appendRevision(
        nextState,
        createRevision(
          'Updated BOQ row',
          action.id,
          `Changed predecessors for ${action.id}.`,
        ),
      )
    }

    case 'update-measurement': {
      const nextState: ProjectState = {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id
            ? {
                ...item,
                measurement: {
                  ...item.measurement,
                  [action.field]: action.value,
                },
              }
            : item,
        ),
      }

      return appendRevision(
        nextState,
        createRevision(
          'Updated measurement',
          action.id,
          `Changed ${action.field} for ${action.id} to ${action.value}.`,
        ),
      )
    }

    case 'add-item': {
      const item = newItemTemplate(state.items.length + 1)
      return appendRevision(
        {
          ...state,
          items: [...state.items, item],
        },
        createRevision('Added BOQ row', item.id, `Inserted ${item.code}.`),
      )
    }

    case 'remove-item':
      return appendRevision(
        {
          ...state,
          items: state.items
            .filter((item) => item.id !== action.id)
            .map((item) => ({
              ...item,
              predecessors: item.predecessors.filter(
                (predecessor) => predecessor !== action.id,
              ),
            })),
        },
        createRevision('Removed BOQ row', action.id, `Removed ${action.id} from the estimate.`),
      )

    case 'reset-example':
      return appendRevision(
        structuredClone(initialProjectState),
        createRevision('Reset project', 'Example project', 'Restored seeded demo values.'),
      )
  }
}

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)

function App() {
  const [state, dispatch] = useReducer(reducer, initialProjectState)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('day')

  const activities = useMemo(() => deriveActivities(state.items), [state.items])
  const schedule = useMemo(() => computeSchedule(activities), [activities])
  const conflicts = useMemo(
    () => detectConflicts(schedule.activities),
    [schedule.activities],
  )
  const validations = useMemo(() => validateBoqItems(state.items), [state.items])
  const summary = useMemo(
    () => summarizeProject(state.assumptions, activities),
    [activities, state.assumptions],
  )
  const safeWorkingDaysPerWeek = Math.max(state.assumptions.workingDaysPerWeek, 1)

  const scheduleColumns = Math.max(
    scaleMode === 'day'
      ? schedule.projectDuration
      : Math.ceil(schedule.projectDuration / safeWorkingDaysPerWeek),
    1,
  )

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Civil estimating + planning studio</p>
          <h1>{state.assumptions.projectName}</h1>
          <p className="hero-copy">
            Prepare measurable BOQ rows, convert quantities into durations, verify
            assumptions, and review a CPM-backed schedule with conflict alerts and a
            revision trail.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={() => dispatch({ type: 'add-item' })}>
            Add BOQ row
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => dispatch({ type: 'reset-example' })}
          >
            Reset example
          </button>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Direct cost</span>
          <strong>{formatCurrency(summary.directCost, state.assumptions.currency)}</strong>
        </article>
        <article className="metric-card">
          <span>Forecast total</span>
          <strong>{formatCurrency(summary.grandTotal, state.assumptions.currency)}</strong>
        </article>
        <article className="metric-card">
          <span>Programme duration</span>
          <strong>{schedule.projectDuration} days</strong>
        </article>
        <article className="metric-card">
          <span>Critical activities</span>
          <strong>{schedule.activities.filter((activity) => activity.critical).length}</strong>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Assumptions and standards</h2>
              <p>Every commercial and planning result stays linked to an explicit basis.</p>
            </div>
          </div>
          <div className="assumptions-grid">
            <label>
              Project name
              <input
                value={state.assumptions.projectName}
                onChange={(event) =>
                  dispatch({
                    type: 'update-assumption-text',
                    field: 'projectName',
                    value: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Location
              <input
                value={state.assumptions.location}
                onChange={(event) =>
                  dispatch({
                    type: 'update-assumption-text',
                    field: 'location',
                    value: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Currency
              <select
                value={state.assumptions.currency}
                onChange={(event) =>
                  dispatch({
                    type: 'update-assumption-text',
                    field: 'currency',
                    value: event.target.value,
                  })
                }
              >
                <option value="BDT">BDT</option>
                <option value="KWD">KWD</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label>
              Start date
              <input
                type="date"
                value={state.assumptions.startDate}
                onChange={(event) =>
                  dispatch({
                    type: 'update-assumption-text',
                    field: 'startDate',
                    value: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Overheads %
              <input
                type="number"
                min="0"
                step="0.5"
                value={state.assumptions.overheadPct}
                onChange={(event) =>
                  dispatch({
                    type: 'update-assumption-number',
                    field: 'overheadPct',
                    value: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Contingency %
              <input
                type="number"
                min="0"
                step="0.5"
                value={state.assumptions.contingencyPct}
                onChange={(event) =>
                  dispatch({
                    type: 'update-assumption-number',
                    field: 'contingencyPct',
                    value: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <ul className="standards-list">
            {state.assumptions.standards.map((standard) => (
              <li key={standard}>{standard}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Verification board</h2>
              <p>Validation, cycle checks, and work-front conflicts update live.</p>
            </div>
          </div>
          <div className="status-stack">
            <div className={validations.length ? 'notice warning' : 'notice success'}>
              {validations.length
                ? `${validations.length} validation issue(s) need review.`
                : 'All BOQ rows pass core validation checks.'}
            </div>
            {schedule.hasCycle && (
              <div className="notice danger">
                Dependency cycle detected. Remove circular predecessors to restore CPM.
              </div>
            )}
            <div
              className={
                schedule.hasCycle
                  ? 'notice warning'
                  : conflicts.length
                    ? 'notice warning'
                    : 'notice success'
              }
            >
              {schedule.hasCycle
                ? 'Conflict checking is blocked until dependency cycles are removed.'
                : conflicts.length
                  ? `${conflicts.length} overlapping crew/work-front conflict(s) found.`
                  : 'No crew or work-front conflicts found on the early-start plan.'}
            </div>
          </div>
          <div className="issues-list">
            {validations.map((issue) => (
              <div key={`${issue.itemId}-${issue.message}`} className="issue-card">
                <strong>{issue.itemId}</strong>
                <p>{issue.message}</p>
              </div>
            ))}
            {conflicts.map((conflict) => (
              <div key={conflict.reason} className="issue-card">
                <strong>{conflict.activityIds.join(' ↔ ')}</strong>
                <p>
                  {conflict.reason} Days {conflict.overlapStart + 1}-
                  {conflict.overlapFinish}.
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Editable BOQ and estimating table</h2>
            <p>
              Quantities are calculated from measured inputs, then converted to cost and
              duration using row-level productivity.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Description</th>
                <th>Unit</th>
                <th>L</th>
                <th>W</th>
                <th>D</th>
                <th>N</th>
                <th>F</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Prod/day</th>
                <th>Predecessors</th>
                <th>Crew</th>
                <th>Work-front</th>
                <th>Spec basis</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>
                    <input
                      value={item.description}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-item-text',
                          id: item.id,
                          field: 'description',
                          value: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={item.unit}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-item-unit',
                          id: item.id,
                          value: event.target.value as BoqItem['unit'],
                        })
                      }
                    >
                      <option value="m">m</option>
                      <option value="m2">m²</option>
                      <option value="m3">m³</option>
                      <option value="item">item</option>
                    </select>
                  </td>
                  {(['length', 'width', 'depth', 'count', 'factor'] as const).map((field) => (
                    <td key={field}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.measurement[field]}
                        onChange={(event) =>
                          dispatch({
                            type: 'update-measurement',
                            id: item.id,
                            field,
                            value: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>{numberFormatter.format(computeItemQuantity(item))}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.rate}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-item-number',
                          id: item.id,
                          field: 'rate',
                          value: Number(event.target.value),
                        })
                      }
                    />
                  </td>
                  <td>{formatCurrency(computeItemCost(item), state.assumptions.currency)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.productivityPerDay}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-item-number',
                          id: item.id,
                          field: 'productivityPerDay',
                          value: Number(event.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={item.predecessors.join(', ')}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-item-predecessors',
                          id: item.id,
                          value: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={item.crew}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-item-text',
                          id: item.id,
                          field: 'crew',
                          value: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={item.workFront}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-item-text',
                          id: item.id,
                          field: 'workFront',
                          value: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      rows={2}
                      value={item.specification}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-item-text',
                          id: item.id,
                          field: 'specification',
                          value: event.target.value,
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => dispatch({ type: 'remove-item', id: item.id })}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspace-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Derived activity programme</h2>
              <p>CPM values come directly from the measured BOQ rows.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Qty</th>
                  <th>Dur.</th>
                  <th>ES</th>
                  <th>EF</th>
                  <th>LS</th>
                  <th>LF</th>
                  <th>Float</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.activities.map((activity) => (
                  <tr key={activity.id}>
                    <td>
                      <strong>{activity.id}</strong>
                      <div>{activity.name}</div>
                    </td>
                    <td>{numberFormatter.format(activity.quantity)}</td>
                    <td>{activity.duration}d</td>
                    <td>{activity.earliestStart + 1}</td>
                    <td>{activity.earliestFinish}</td>
                    <td>{activity.latestStart + 1}</td>
                    <td>{activity.latestFinish}</td>
                    <td>{activity.totalFloat}</td>
                    <td>
                      <span className={activity.critical ? 'badge critical' : 'badge'}>
                        {activity.critical ? 'Critical' : 'Float available'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Revision trail</h2>
              <p>All edits stay visible for checking assumptions and estimator changes.</p>
            </div>
          </div>
          <div className="timeline">
            {state.revisions.map((revision) => (
              <div key={revision.id} className="timeline-item">
                <div>
                  <strong>{revision.action}</strong>
                  <p>{revision.summary}</p>
                </div>
                <span>
                  {new Date(revision.timestamp).toLocaleString('en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Interactive Gantt view</h2>
            <p>
              Review the early-start programme with day or week scaling, date labels, and
              critical-path highlighting.
            </p>
          </div>
          <div className="toggle-group">
            <button
              type="button"
              className={scaleMode === 'day' ? 'active-toggle' : 'secondary'}
              onClick={() => setScaleMode('day')}
            >
              Day
            </button>
            <button
              type="button"
              className={scaleMode === 'week' ? 'active-toggle' : 'secondary'}
              onClick={() => setScaleMode('week')}
            >
              Week
            </button>
          </div>
        </div>

        <div className="gantt-shell">
          <div
            className="gantt-grid gantt-header"
            style={{ gridTemplateColumns: `220px repeat(${scheduleColumns}, minmax(48px, 1fr))` }}
          >
            <div className="gantt-side">Activity</div>
            {Array.from({ length: scheduleColumns }, (_, index) => (
              <div key={index} className="gantt-cell">
                {scaleMode === 'day'
                  ? dayToDateLabel(state.assumptions.startDate, index)
                  : `${dayToDateLabel(
                      state.assumptions.startDate,
                      index * safeWorkingDaysPerWeek,
                    )} · W${index + 1}`}
              </div>
            ))}
          </div>
          {schedule.activities.map((activity) => {
            const startColumn =
              scaleMode === 'day'
                ? activity.earliestStart + 2
                  : Math.floor(activity.earliestStart / safeWorkingDaysPerWeek) + 2
            const span =
                scaleMode === 'day'
                  ? Math.max(activity.duration, 1)
                  : Math.max(Math.ceil(activity.duration / safeWorkingDaysPerWeek), 1)

            return (
              <div
                key={activity.id}
                className="gantt-grid gantt-row"
                style={{
                  gridTemplateColumns: `220px repeat(${scheduleColumns}, minmax(48px, 1fr))`,
                }}
              >
                <div className="gantt-side">
                  <strong>{activity.id}</strong>
                  <span>{activity.name}</span>
                  <small>
                    {dayToDateLabel(
                      state.assumptions.startDate,
                      activity.earliestStart,
                    )}{' '}
                    →{' '}
                    {dayToDateLabel(
                      state.assumptions.startDate,
                      Math.max(activity.earliestFinish - 1, 0),
                    )}
                  </small>
                </div>
                <div
                  className={activity.critical ? 'gantt-bar critical-bar' : 'gantt-bar'}
                  style={{ gridColumn: `${startColumn} / span ${span}` }}
                  title={`${activity.id}: ${activity.duration} day(s), crew ${activity.crew}`}
                >
                  {activity.id}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export default App
