import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyDeadline,
  filterTasksByView,
  filterTasksByStatusAndDue,
  calculateFilterCounts,
} from '../src/utils/deadlineClassifier.js'

test('Deterministic rules for all 9 filters & equivalence with legacy filterTasksByView', () => {
  const fixedNow = new Date('2026-10-21T12:00:00Z')

  // Construct a diverse fixture dataset
  const sampleTasks = [
    // 1. Overdue: unfinished past deadline
    { id: '1', title: 'Overdue task', due_date: '2026-10-19T10:00:00Z', status: 'open' },
    // 2. Due today: future deadline on current local day
    { id: '2', title: 'Due today task', due_date: '2026-10-21T18:00:00Z', status: 'pending' },
    // 3. Urgent: within 24h (e.g., next morning 08:00 UTC = 20h from now)
    { id: '3', title: 'Urgent task (<24h)', due_date: '2026-10-22T08:00:00Z', status: 'in_progress' },
    // 4. Due soon: within 7 days (e.g., 3 days ahead)
    { id: '4', title: 'Due soon task (3d)', due_date: '2026-10-24T12:00:00Z', status: 'in_progress' },
    // 5. Upcoming: > 7 days ahead (e.g., 14 days ahead)
    { id: '5', title: 'Upcoming task (14d)', due_date: '2026-11-04T12:00:00Z', status: 'pending' },
    // 6. Pending without deadline
    { id: '6', title: 'No deadline pending', status: 'pending' },
    // 7. Completed task with past deadline (must not show up as overdue)
    { id: '7', title: 'Completed task', due_date: '2026-10-15T10:00:00Z', status: 'completed' },
    // 8. Cancelled task (must not show up as active deadline)
    { id: '8', title: 'Cancelled task', due_date: '2026-10-21T14:00:00Z', status: 'cancelled' },
  ]

  // Test 1: All 9 original filters return identical results in both systems
  const legacyToNewMap = [
    { legacy: 'all', status: 'all', due: 'all' },
    { legacy: 'overdue', status: 'all', due: 'overdue' },
    { legacy: 'due_today', status: 'all', due: 'due_today' },
    { legacy: 'urgent', status: 'all', due: 'urgent' },
    { legacy: 'due_soon', status: 'all', due: 'due_soon' },
    { legacy: 'upcoming', status: 'all', due: 'upcoming' },
    { legacy: 'pending', status: 'pending', due: 'all' },
    { legacy: 'in_progress', status: 'in_progress', due: 'all' },
    { legacy: 'completed', status: 'completed', due: 'all' },
  ]

  for (const { legacy, status, due } of legacyToNewMap) {
    const legacyResult = filterTasksByView(sampleTasks, legacy, fixedNow)
    const newResult = filterTasksByStatusAndDue(sampleTasks, status, due, fixedNow)
    assert.deepEqual(
      newResult.map((t) => t.id),
      legacyResult.map((t) => t.id),
      `Filter mismatch for legacy ${legacy} vs status=${status}, due=${due}`
    )
  }

  // Test 2: Overlap check - Urgent (<24h) includes Due Today tasks by definition
  const urgentTasks = filterTasksByStatusAndDue(sampleTasks, 'all', 'urgent', fixedNow)
  const dueTodayTasks = filterTasksByStatusAndDue(sampleTasks, 'all', 'due_today', fixedNow)
  for (const task of dueTodayTasks) {
    assert.ok(urgentTasks.some((u) => u.id === task.id), `Task ${task.id} due today should be included in urgent (<24h)`)
  }

  // Test 3: Combinations (Status + Due)
  // Pending + Upcoming
  const pendingUpcoming = filterTasksByStatusAndDue(sampleTasks, 'pending', 'upcoming', fixedNow)
  assert.equal(pendingUpcoming.length, 1)
  assert.equal(pendingUpcoming[0].id, '5')

  // In Progress + Urgent
  const inProgressUrgent = filterTasksByStatusAndDue(sampleTasks, 'in_progress', 'urgent', fixedNow)
  assert.equal(inProgressUrgent.length, 1)
  assert.equal(inProgressUrgent[0].id, '3')

  // Completed + Overdue (Completed tasks are lifecycle 'completed', not active deadlines)
  const completedOverdue = filterTasksByStatusAndDue(sampleTasks, 'completed', 'overdue', fixedNow)
  assert.equal(completedOverdue.length, 0)

  // Test 4: Dynamic cross-group counts
  const initialCounts = calculateFilterCounts(sampleTasks, 'all', 'all', fixedNow)
  assert.equal(initialCounts.baseOverdueCount, 1)
  assert.equal(initialCounts.dueCounts.overdue, 1)
  assert.equal(initialCounts.statusCounts.pending, 4) // tasks 1, 2, 5, 6 have lifecycle 'pending'
  assert.equal(initialCounts.statusCounts.in_progress, 2) // tasks 3, 4
  assert.equal(initialCounts.statusCounts.completed, 1) // task 7

  // Cross-group count accuracy when statusFilter = 'in_progress'
  const inProgressCounts = calculateFilterCounts(sampleTasks, 'in_progress', 'all', fixedNow)
  assert.equal(inProgressCounts.dueCounts.urgent, 1) // task 3
  assert.equal(inProgressCounts.dueCounts.due_soon, 1) // task 4
  assert.equal(inProgressCounts.dueCounts.overdue, 0)

  // Cross-group count accuracy when dueFilter = 'overdue'
  const overdueCounts = calculateFilterCounts(sampleTasks, 'all', 'overdue', fixedNow)
  assert.equal(overdueCounts.statusCounts.pending, 1) // task 1 has status 'open' which maps to 'pending'
  assert.equal(overdueCounts.statusCounts.in_progress, 0)
  assert.equal(overdueCounts.statusCounts.completed, 0)

  // Test 5: Edge cases - empty and null datasets
  assert.deepEqual(filterTasksByStatusAndDue([], 'all', 'all'), [])
  assert.deepEqual(filterTasksByStatusAndDue(null, 'all', 'all'), [])
  const emptyCounts = calculateFilterCounts([], 'all', 'all')
  assert.equal(emptyCounts.statusCounts.all, 0)
  assert.equal(emptyCounts.dueCounts.all, 0)
  assert.equal(emptyCounts.baseOverdueCount, 0)
})
