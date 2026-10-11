export const BUDGET_CATEGORIES = [
  { key: 'transport', label: 'Transport', plannedLabel: 'Transport', icon: '↗', color: '#4f46e5' },
  { key: 'accommodation', label: 'Accommodation', plannedLabel: 'Accommodation', icon: '⌂', color: '#0f766e' },
  { key: 'food', label: 'Food', plannedLabel: 'Food', icon: '◒', color: '#ea580c' },
  { key: 'activities', label: 'Activities', plannedLabel: 'Activities', icon: '✦', color: '#7c3aed' },
  { key: 'shopping', label: 'Shopping', plannedLabel: 'Shopping', icon: '◇', color: '#ca8a04' },
  { key: 'miscellaneous', label: 'Miscellaneous', plannedLabel: 'Unallocated', icon: '···', color: '#64748b' },
];

export const BUDGET_TIPS = {
  transport: 'Compare local options and combine nearby stops to keep transport costs within plan.',
  accommodation: 'Review the remaining nights and confirm the selected stay still fits the group budget.',
  food: 'Set a daily food allowance and record shared meals as soon as they are paid.',
  activities: 'Check entry fees before the visit and log group tickets against the Activities category.',
  shopping: 'Keep optional purchases within the unallocated amount rather than the trip essentials budget.',
  miscellaneous: 'Assign unallocated funds deliberately before adding non-essential spending.',
};

export function getBudgetCategory(category) {
  return BUDGET_CATEGORIES.find((item) => item.key === category) || BUDGET_CATEGORIES[BUDGET_CATEGORIES.length - 1];
}
