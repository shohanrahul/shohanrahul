# Civil BOQ, Estimating, and CPM Planner

A responsive React + TypeScript web application for:

- preparing Bills of Quantities (BOQ)
- calculating civil-engineering quantities from measured inputs
- converting quantities into cost and productivity-based durations
- generating a CPM schedule from editable predecessors
- detecting crew and work-front conflicts
- visualising the programme on an interactive Gantt chart
- maintaining a revision and verification trail

## Features

- **Editable BOQ rows** with live quantity, cost, and duration calculations
- **Traceable assumptions** for standards, location, currency, overhead, contingency, and start date
- **CPM scheduling engine** with earliest/latest dates, float, and critical-path flags
- **Conflict detection** for overlapping crews and work-fronts
- **Interactive Gantt** with day/week scaling
- **Revision trail** for estimator and planner changes
- **Realistic example data** referencing Bangladesh and Kuwait civil-works contexts
- **Automated unit tests** for calculation and planning logic

## Getting started

```bash
npm install
npm run dev
```

## Validation

```bash
npm run build
npm run lint
npm run test
```
