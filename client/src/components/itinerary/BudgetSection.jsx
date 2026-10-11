import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../services/api';
import { BUDGET_CATEGORIES, BUDGET_TIPS, getBudgetCategory } from '../../config/budgetCategories';
import { formatExactPaise, formatWholePaise } from '../../utils/budgetUtils';
import ExpenseDrawer from './budget/ExpenseDrawer';
import ReportDialog from './budget/ReportDialog';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'balances', label: 'Balances' },
];

export default function BudgetSection({ tripId }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [budget, setBudget] = useState(null);
  const [expenseGroups, setExpenseGroups] = useState([]);
  const [filterError, setFilterError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [drawerExpense, setDrawerExpense] = useState(undefined);
  const [settlementSuggestion, setSettlementSuggestion] = useState(null);
  const [settlementError, setSettlementError] = useState('');
  const [isSavingSettlement, setIsSavingSettlement] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [filters, setFilters] = useState({
    day: '',
    category: '',
    personId: '',
    paymentMethod: '',
    search: '',
  });
  const drawerTriggerRef = useRef(null);

  const loadBudget = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const response = await api.get(`/trips/${tripId}/budget`);
      setBudget(response.data.data);
      setLoadError('');
      return response.data.data;
    } catch (error) {
      setLoadError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadBudget(true).catch(() => {});
  }, [loadBudget]);

  useEffect(() => {
    if (activeTab !== 'expenses') return undefined;
    const timer = window.setTimeout(async () => {
      try {
        const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
        params.groupByDay = true;
        const response = await api.get(`/trips/${tripId}/expenses`, { params });
        setExpenseGroups(response.data.data);
        setFilterError('');
      } catch (error) {
        setFilterError(error.message);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [activeTab, filters, tripId, budget]);

  const openAddDrawer = useCallback((event) => {
    drawerTriggerRef.current = event.currentTarget;
    setDrawerExpense(null);
  }, []);

  const openEditDrawer = useCallback((event, expense) => {
    drawerTriggerRef.current = event.currentTarget;
    setDrawerExpense(expense);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerExpense(undefined);
    window.requestAnimationFrame(() => drawerTriggerRef.current?.focus());
  }, []);

  async function saveExpense(payload, existing) {
    const request = existing
      ? api.put(`/expenses/${existing._id}`, payload)
      : api.post(`/trips/${tripId}/expenses`, payload);
    await request;
    await loadBudget();
  }

  async function deleteExpense(expense) {
    if (!window.confirm(`Delete “${expense.description || getBudgetCategory(expense.category).label}”? This cannot be undone.`)) return;
    try {
      await api.delete(`/expenses/${expense._id}`);
      await loadBudget();
    } catch (error) {
      setLoadError(error.message);
    }
  }

  async function saveSettlement(payload) {
    setIsSavingSettlement(true);
    setSettlementError('');
    try {
      await api.post(`/trips/${tripId}/settlements`, payload);
      setSettlementSuggestion(null);
      await loadBudget();
    } catch (error) {
      setSettlementError(error.message);
    } finally {
      setIsSavingSettlement(false);
    }
  }

  async function deleteSettlement(settlement) {
    if (!window.confirm(`Delete the settlement from ${settlement.fromMemberName} to ${settlement.toMemberName}?`)) return;
    try {
      await api.delete(`/settlements/${settlement._id}`);
      await loadBudget();
    } catch (error) {
      setLoadError(error.message);
    }
  }

  if (isLoading) return <BudgetLoading />;
  if (loadError && !budget) return <BudgetLoadError message={loadError} retry={() => loadBudget(true).catch(() => {})} />;
  if (!budget) return null;

  const membersById = new Map(budget.members.map((member) => [member.memberId, member]));
  const recentExpenses = [...budget.expenses].sort((left, right) => (
    right.date.localeCompare(left.date) || new Date(right.createdAt) - new Date(left.createdAt)
  )).slice(0, 5);

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Trip budget</h1>
          <p className="mt-1 text-sm text-ink-500">{budget.tripName}{budget.destination ? ` · ${budget.destination}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setActiveTab('expenses')} className="btn-secondary">Add expense</button>
          <button type="button" onClick={() => setIsReportOpen(true)} className="btn-primary">Download report</button>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-stone-200" aria-label="Budget sections" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            id={`budget-tab-${tab.key}`}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`budget-panel-${tab.key}`}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${activeTab === tab.key ? 'border-ocean text-ocean' : 'border-transparent text-ink-500 hover:text-ink'}`}
          >
            {tab.label}
          </button>
        ))}
        {isRefreshing && <span className="ml-auto self-center text-xs text-ink-400" role="status">Updating…</span>}
      </nav>

      {loadError && <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay" role="alert">{loadError}</p>}
      {activeTab === 'overview' && (
        <section id="budget-panel-overview" role="tabpanel" aria-labelledby="budget-tab-overview" className="space-y-5">
          <OverviewTab
            budget={budget}
            recentExpenses={recentExpenses}
            membersById={membersById}
            onAdd={(event) => {
              openAddDrawer(event);
            }}
            onEdit={openEditDrawer}
            onViewExpenses={() => setActiveTab('expenses')}
            onDownload={() => setIsReportOpen(true)}
          />
        </section>
      )}

      {activeTab === 'expenses' && (
        <section id="budget-panel-expenses" role="tabpanel" aria-labelledby="budget-tab-expenses" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Expense ledger</h2>
              <p className="text-sm text-ink-500">Expenses are grouped by date; settlements are not counted as spending.</p>
            </div>
            <button type="button" onClick={openAddDrawer} className="btn-primary">+ Add expense</button>
          </div>
          <ExpenseFilters filters={filters} setFilters={setFilters} budget={budget} />
          {filterError && <p role="alert" className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{filterError}</p>}
          {expenseGroups.length ? (
            <div className="space-y-4">
              {expenseGroups.map((group) => (
                <section key={group.date} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                  <header className="flex items-center justify-between gap-3 bg-stone-50 px-4 py-3">
                    <div>
                      <h3 className="font-semibold text-ink">{group.dayLabel}</h3>
                      <p className="text-xs text-ink-500">{formatDisplayDate(group.date)}</p>
                    </div>
                    <span className="text-sm font-semibold text-ink">{formatExactPaise(group.totalPaise)}</span>
                  </header>
                  <div className="divide-y divide-stone-100">
                    {group.expenses.map((expense) => (
                      <ExpenseRow
                        key={expense._id}
                        expense={expense}
                        currentUserId={budget.currentUserId}
                        membersById={membersById}
                        onEdit={openEditDrawer}
                        onDelete={deleteExpense}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : <EmptyState title="No matching expenses" body="Try changing a filter or add the first expense for this trip." action="Add expense" onAction={openAddDrawer} />}
        </section>
      )}

      {activeTab === 'balances' && (
        <section id="budget-panel-balances" role="tabpanel" aria-labelledby="budget-tab-balances" className="space-y-5">
          <BalancesTab
            budget={budget}
            membersById={membersById}
            onSettle={(suggestion) => setSettlementSuggestion(suggestion)}
            onDeleteSettlement={deleteSettlement}
          />
        </section>
      )}

      {drawerExpense !== undefined && (
        <ExpenseDrawer
          key={drawerExpense?._id || 'new-expense'}
          expense={drawerExpense}
          trip={budget}
          members={budget.members}
          userId={budget.currentUserId}
          onClose={closeDrawer}
          onSave={(payload) => saveExpense(payload, drawerExpense)}
        />
      )}
      {settlementSuggestion && (
        <SettlementDialog
          suggestion={settlementSuggestion}
          members={budget.members}
          onClose={() => {
            setSettlementSuggestion(null);
            setSettlementError('');
          }}
          onSave={saveSettlement}
          error={settlementError}
          isSaving={isSavingSettlement}
        />
      )}
      {isReportOpen && <ReportDialog tripId={tripId} budget={budget} onClose={() => setIsReportOpen(false)} />}
    </div>
  );
}

function OverviewTab({ budget, recentExpenses, membersById, onAdd, onEdit, onViewExpenses, onDownload }) {
  const [expandedCategory, setExpandedCategory] = useState('');
  const wholeProgress = budget.totalBudgetPaise ? Math.min(100, Math.max(0, budget.progressPct)) : 0;
  const plannedCategories = budget.categories.filter((item) => item.plannedPaise > 0);
  const plannedSum = plannedCategories.reduce((sum, item) => sum + item.plannedPaise, 0);
  let angle = 0;
  const gradientStops = plannedSum
    ? plannedCategories.map((item) => {
      const next = angle + (item.plannedPaise / plannedSum) * 360;
      const color = getBudgetCategory(item.category).color;
      const stop = `${color} ${angle}deg ${next}deg`;
      angle = next;
      return stop;
    })
    : [];
  const donutStyle = { background: gradientStops.length ? `conic-gradient(${gradientStops.join(', ')})` : '#e7e5e4' };
  const remainingPercent = budget.totalBudgetPaise > 0
    ? Math.max(0, Math.min(100, ((budget.totalBudgetPaise - budget.spentPaise) / budget.totalBudgetPaise) * 100))
    : 0;
  const tips = [...budget.categories]
    .filter((item) => item.plannedPaise > 0 || item.actualPaise > 0)
    .sort((left, right) => ratio(right) - ratio(left))
    .slice(0, 2);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total budget" value={formatWholePaise(budget.totalBudgetPaise)} detail={budget.totalBudgetPaise ? 'Trip allocation' : 'No budget set'} />
        <SummaryCard label="Spent" value={formatWholePaise(budget.spentPaise)} detail={`${budget.expenses.length} recorded expense${budget.expenses.length === 1 ? '' : 's'}`} />
        <SummaryCard label="Remaining" value={formatWholePaise(budget.remainingPaise)} detail={budget.remainingPaise < 0 ? 'Over the planned amount' : 'Available to spend'} tone={budget.remainingPaise < 0 ? 'red' : 'green'} />
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm text-ink-500">Daily average / Trip days</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{formatWholePaise(budget.dailyBudgetPaise)}</p>
            </div>
            <span className="rounded-lg bg-ocean/10 px-2.5 py-1 text-xs font-semibold text-ocean">{budget.tripDays} days</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-ocean" style={{ width: `${wholeProgress}%` }} /></div>
          <p className="mt-2 text-right text-xs text-ink-500">{budget.progressPct}% of total budget spent</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Budget overview</h2>
              <p className="mt-1 text-sm text-ink-500">Planned allocation by category</p>
            </div>
            <button type="button" onClick={onDownload} className="text-sm font-semibold text-ocean hover:underline">Download report</button>
          </div>
          <div className="mt-5 grid items-center gap-6 md:grid-cols-[190px_1fr]">
            <div className="relative mx-auto h-44 w-44 rounded-full p-4" style={donutStyle} aria-label="Planned budget by category">
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
                <span className="text-xs text-ink-500">Planned / Total budget</span>
                <strong className="mt-1 max-w-[125px] truncate text-xl text-ink">{formatWholePaise(plannedSum)}</strong>
                <span className="text-xs text-ink-400">{formatWholePaise(budget.totalBudgetPaise)} total</span>
              </div>
            </div>
            <div className="w-full">
              <div className="grid grid-cols-[1fr_auto] border-b border-stone-200 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <span>Category</span><span>Planned amount</span>
              </div>
              <div className="divide-y divide-stone-100">
                {BUDGET_CATEGORIES.map((category) => {
                  const item = budget.categories.find((entry) => entry.category === category.key);
                  return (
                    <div key={category.key} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 text-sm">
                      <span className="flex items-center gap-2 text-ink-600"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />{category.plannedLabel}</span>
                      <span className="font-medium text-ink">{formatWholePaise(item?.plannedPaise || 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {!budget.totalBudgetPaise && <p className="mt-4 rounded-lg bg-marigold-50 px-3 py-2 text-sm text-marigold-700">No trip budget is set. Actual spending is still tracked.</p>}
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-ink">Spending health</h2>
          <p className="mt-1 text-sm text-ink-500">Remaining budget</p>
          <div className="mx-auto mt-5 h-32 max-w-[290px] overflow-hidden">
            <svg viewBox="0 0 200 112" className="h-full w-full" role="img" aria-label={`${Math.round(remainingPercent)} percent of budget remaining`}>
              <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e7e5e4" strokeWidth="18" strokeLinecap="round" pathLength="100" />
              <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={statusColor(budget.status, budget.totalBudgetPaise)} strokeWidth="18" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - remainingPercent} />
            </svg>
            <div className="-mt-12 text-center">
              <p className="text-2xl font-semibold text-ink">{budget.totalBudgetPaise ? `${Math.round(remainingPercent)}%` : '—'}</p>
              <p className="text-xs text-ink-500">remaining</p>
            </div>
          </div>
          <div className={`mt-5 rounded-lg px-4 py-3 ${healthTone(budget.status, budget.totalBudgetPaise)}`}>
            <p className="font-semibold">{healthTitle(budget.status, budget.totalBudgetPaise)}</p>
            <p className="mt-1 text-sm">{healthDescription(budget)}</p>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div><h2 className="text-lg font-semibold text-ink">Planned vs actual</h2><p className="mt-1 text-sm text-ink-500">Planned estimates are derived from trip data; unprovided amounts remain unallocated.</p></div>
          <button type="button" onClick={onDownload} className="text-sm font-semibold text-ocean hover:underline">Download report</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-ink-400">
              <tr><th className="px-5 py-3 font-semibold">Category</th><th className="px-4 py-3 text-right font-semibold">Planned</th><th className="px-4 py-3 text-right font-semibold">Actual</th><th className="px-4 py-3 text-right font-semibold">Remaining</th><th className="px-5 py-3 font-semibold">Progress</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {budget.categories.map((item) => {
                const category = getBudgetCategory(item.category);
                const isOpen = expandedCategory === item.category;
                const matching = budget.expenses.filter((expense) => expense.category === item.category);
                return (
                  <FragmentCategoryRow
                    key={item.category}
                    category={category}
                    item={item}
                    isOpen={isOpen}
                    expenses={matching}
                    currentUserId={budget.currentUserId}
                    membersById={membersById}
                    onToggle={() => setExpandedCategory(isOpen ? '' : item.category)}
                    onEdit={onEdit}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-ink">Recent expenses</h2><p className="mt-1 text-sm text-ink-500">Latest recorded trip spending</p></div>
            {recentExpenses.length > 0 && <button type="button" onClick={onViewExpenses} className="text-sm font-semibold text-ocean hover:underline">View all →</button>}
          </div>
          {recentExpenses.length ? (
            <div className="mt-4 divide-y divide-stone-100">
              {recentExpenses.map((expense) => (
                <CompactExpenseRow key={expense._id} expense={expense} onEdit={onEdit} currentUserId={budget.currentUserId} membersById={membersById} />
              ))}
            </div>
          ) : (
            <div className="mt-4"><EmptyState title="No expenses yet" body="Record the first expense to see actual spending here." action="Add expense" onAction={onAdd} /></div>
          )}
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Budget tips</h2>
          <p className="mt-1 text-sm text-ink-500">Based on categories closest to or above their planned amount.</p>
          {tips.length ? (
            <div className="mt-4 space-y-3">
              {tips.map((item) => {
                const category = getBudgetCategory(item.category);
                return <div key={item.category} className="flex gap-3 rounded-lg bg-stone-50 p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm" style={{ color: category.color }}>{category.icon}</span><p className="text-sm leading-6 text-ink-600"><strong>{category.label}:</strong> {BUDGET_TIPS[item.category]}</p></div>;
              })}
            </div>
          ) : <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-ink-500">Category tips appear when planned amounts are available.</p>}
        </section>
      </div>
    </>
  );
}

function FragmentCategoryRow({ category, item, isOpen, expenses, currentUserId, membersById, onToggle, onEdit }) {
  const progress = Math.min(100, Math.max(0, item.progressPct));
  const overspent = item.remainingPaise < 0;
  return (
    <>
      <tr>
        <td className="px-5 py-3">
          <button type="button" onClick={onToggle} aria-expanded={isOpen} className="font-medium text-ink hover:text-ocean">{category.label} <span className="text-xs text-ocean">View details {isOpen ? '↑' : '→'}</span></button>
        </td>
        <td className="px-4 py-3 text-right text-ink-600">{formatWholePaise(item.plannedPaise)}</td>
        <td className="px-4 py-3 text-right text-ink-600">{formatWholePaise(item.actualPaise)}</td>
        <td className={`px-4 py-3 text-right font-medium ${overspent ? 'text-clay' : 'text-ink-600'}`}>{formatWholePaise(item.remainingPaise)}</td>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2"><div className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${overspent ? 'bg-clay' : 'bg-teal'}`} style={{ width: `${progress}%` }} /></div><span className={`w-10 text-right text-xs ${overspent ? 'text-clay' : 'text-ink-500'}`}>{item.progressPct}%</span></div>
        </td>
      </tr>
      {isOpen && (
        <tr><td colSpan="5" className="bg-stone-50 px-5 py-3">
          {expenses.length ? <div className="space-y-2">{expenses.map((expense) => <CompactExpenseRow key={expense._id} expense={expense} onEdit={onEdit} currentUserId={currentUserId} membersById={membersById} />)}</div> : <p className="text-sm text-ink-500">No expenses in this category.</p>}
        </td></tr>
      )}
    </>
  );
}

function ExpenseFilters({ filters, setFilters, budget }) {
  function update(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }
  return (
    <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
      <input type="search" value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Search description" className="rounded-md border border-stone-300 px-3 py-2 text-sm lg:col-span-1" />
      <select value={filters.day} onChange={(event) => update('day', event.target.value)} className="rounded-md border border-stone-300 px-3 py-2 text-sm">
        <option value="">All trip days</option>
        <option value="before">Before trip</option>
        {Array.from({ length: budget.tripDays }, (_, index) => <option key={index + 1} value={index + 1}>Day {index + 1}</option>)}
        <option value="after">After trip</option>
      </select>
      <select value={filters.category} onChange={(event) => update('category', event.target.value)} className="rounded-md border border-stone-300 px-3 py-2 text-sm">
        <option value="">All categories</option>
        {BUDGET_CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
      </select>
      <select value={filters.personId} onChange={(event) => update('personId', event.target.value)} className="rounded-md border border-stone-300 px-3 py-2 text-sm">
        <option value="">All people</option>
        {budget.members.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}
      </select>
      <select value={filters.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value)} className="rounded-md border border-stone-300 px-3 py-2 text-sm">
        <option value="">All payment methods</option>
        {['UPI', 'Cash', 'Card', 'Net banking', 'Other'].map((method) => <option key={method} value={method}>{method}</option>)}
      </select>
    </div>
  );
}

function ExpenseRow({ expense, currentUserId, membersById, onEdit, onDelete }) {
  const category = getBudgetCategory(expense.category);
  const ownShare = expense.splits?.find((split) => String(split.memberId) === String(currentUserId))?.sharePaise || 0;
  return (
    <article className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      <CategoryIcon category={category} />
      <div className="min-w-[150px] flex-1">
        <p className="font-medium text-ink">{expense.description || category.label}</p>
        <p className="mt-1 text-xs text-ink-500">{formatDisplayDate(expense.date)} · Paid by {membersById.get(String(expense.paidBy))?.name || expense.paidByName} · Added by {expense.addedByName || 'Trip member'}</p>
        <p className="mt-1 text-xs text-ink-400">{category.label} · {expense.paymentMethod}{expense.receipt ? ' · Receipt attached' : ''}</p>
      </div>
      <div className="min-w-[115px] text-right">
        <strong className="block text-sm text-ink">{formatExactPaise(expense.amountPaise)}</strong>
        <span className="mt-1 block text-xs text-ink-500">Your share {formatExactPaise(ownShare)}</span>
      </div>
      <div className="flex gap-2">
        {expense.editable && <button type="button" onClick={(event) => onEdit(event, expense)} className="rounded-md px-2 py-1 text-xs font-semibold text-ocean hover:bg-ocean/5">Edit</button>}
        {expense.editable && <button type="button" onClick={() => onDelete(expense)} className="rounded-md px-2 py-1 text-xs font-semibold text-clay hover:bg-clay/5">Delete</button>}
      </div>
    </article>
  );
}

function CompactExpenseRow({ expense, onEdit, currentUserId, membersById }) {
  const category = getBudgetCategory(expense.category);
  const ownShare = expense.splits?.find((split) => String(split.memberId) === String(currentUserId))?.sharePaise || 0;
  return (
    <div className="flex items-center gap-3 py-3">
      <CategoryIcon category={category} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{expense.description || category.label}</p>
        <p className="mt-1 text-xs text-ink-500">{formatDisplayDate(expense.date)} · {membersById.get(String(expense.paidBy))?.name || expense.paidByName} paid</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-ink">{formatExactPaise(expense.amountPaise)}</p>
        <p className="text-xs text-ink-500">Your share {formatExactPaise(ownShare)}</p>
      </div>
      {expense.editable && <button type="button" onClick={(event) => onEdit(event, expense)} aria-label={`Edit ${expense.description || category.label}`} className="text-xs font-semibold text-ocean hover:underline">Edit</button>}
    </div>
  );
}

function BalancesTab({ budget, membersById, onSettle, onDeleteSettlement }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Group spending" value={formatWholePaise(budget.spentPaise)} detail="Settlements are excluded" />
        <SummaryCard label="Trip budget" value={formatWholePaise(budget.totalBudgetPaise)} detail={budget.tripDays ? `${budget.tripDays} inclusive trip days` : 'Trip duration unavailable'} />
        <SummaryCard label="Remaining" value={formatWholePaise(budget.remainingPaise)} detail="Budget less recorded expenses" tone={budget.remainingPaise < 0 ? 'red' : 'green'} />
      </div>
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-ink">Member balances</h2><p className="mt-1 text-sm text-ink-500">Balance = paid − share + settlements paid − settlements received.</p></div>
          <span className="text-xs text-ink-500">Positive means money is owed to the member.</span>
        </div>
        {budget.perPerson.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {budget.perPerson.map((person) => (
              <article key={person.memberId} className="rounded-xl border border-stone-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-semibold text-ink">{person.name}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${person.balancePaise > 0 ? 'bg-teal/10 text-teal' : person.balancePaise < 0 ? 'bg-clay/10 text-clay' : 'bg-stone-100 text-ink-500'}`}>{person.balancePaise > 0 ? 'Owed' : person.balancePaise < 0 ? 'Owes' : 'Settled'}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-ink-400">Paid</p><p className="mt-1 font-semibold text-ink">{formatExactPaise(person.paidPaise)}</p></div>
                  <div><p className="text-ink-400">Share</p><p className="mt-1 font-semibold text-ink">{formatExactPaise(person.sharePaise)}</p></div>
                  <div><p className="text-ink-400">Balance</p><p className={`mt-1 font-semibold ${person.balancePaise > 0 ? 'text-teal' : person.balancePaise < 0 ? 'text-clay' : 'text-ink'}`}>{formatExactPaise(person.balancePaise)}</p></div>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="mt-4 rounded-lg bg-stone-50 p-4 text-sm text-ink-500">No trip members are available for this balance view.</p>}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Who owes whom</h2>
        {budget.suggestedSettlements.length ? (
          <div className="mt-4 space-y-2">
            {budget.suggestedSettlements.map((suggestion, index) => (
              <div key={`${suggestion.fromMember}-${suggestion.toMember}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 px-4 py-3">
                <p className="text-sm text-ink"><strong>{membersById.get(suggestion.fromMember)?.name || suggestion.fromName}</strong> owes <strong>{membersById.get(suggestion.toMember)?.name || suggestion.toName}</strong> <strong>{formatExactPaise(suggestion.amountPaise)}</strong></p>
                <button type="button" onClick={() => onSettle(suggestion)} className="rounded-md bg-ocean px-3 py-2 text-xs font-semibold text-white hover:bg-ocean/90">Settle up</button>
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-ink-500">No outstanding balances to settle.</p>}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Settlement history</h2>
        {budget.settlements.length ? (
          <div className="mt-3 divide-y divide-stone-100">
            {budget.settlements.map((settlement) => (
              <div key={settlement._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="text-ink"><strong>{membersById.get(String(settlement.fromMember))?.name || settlement.fromMemberName}</strong> paid <strong>{membersById.get(String(settlement.toMember))?.name || settlement.toMemberName}</strong> {formatExactPaise(settlement.amountPaise)}</p>
                  <p className="mt-1 text-xs text-ink-500">{formatDisplayDate(settlement.date)} · {settlement.method}{settlement.note ? ` · ${settlement.note}` : ''} · Added by {settlement.addedByName || 'Trip member'}</p>
                </div>
                {settlement.editable && <button type="button" onClick={() => onDeleteSettlement(settlement)} className="text-xs font-semibold text-clay hover:underline">Delete</button>}
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-ink-500">No settlements recorded.</p>}
      </section>
    </>
  );
}

function SettlementDialog({ suggestion, members, onClose, onSave, error, isSaving }) {
  const [fromMember, setFromMember] = useState(suggestion.fromMember);
  const [toMember, setToMember] = useState(suggestion.toMember);
  const [amount, setAmount] = useState(paiseToInput(suggestion.amountPaise));
  const [date, setDate] = useState(localToday());
  const [method, setMethod] = useState('UPI');
  const [note, setNote] = useState('');
  const amountPaise = parseInrText(amount);
  const invalidAmount = amountPaise === null || amountPaise <= 0;

  async function submit(event) {
    event.preventDefault();
    if (invalidAmount || fromMember === toMember) return;
    await onSave({ fromMember, toMember, amountPaise, date, method, note: note.trim() || null });
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/45 p-3" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="settlement-dialog-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <header className="flex items-start justify-between gap-3"><div><h2 id="settlement-dialog-title" className="text-lg font-semibold text-ink">Record settlement</h2><p className="mt-1 text-sm text-ink-500">Record a payment between trip members. It does not count as spending.</p></div><button type="button" onClick={onClose} aria-label="Close settlement form" className="rounded-md px-2 py-1 text-ink-500 hover:bg-stone-100">✕</button></header>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-ink">From<select value={fromMember} onChange={(event) => setFromMember(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">{members.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">To<select value={toMember} onChange={(event) => setToMember(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">{members.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-ink">Amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" />{invalidAmount && <span className="mt-1 block text-xs text-clay">Enter a positive amount with at most two decimal places.</span>}</label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-ink">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" /></label><label className="block text-sm font-medium text-ink">Method<select value={method} onChange={(event) => setMethod(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2">{['UPI', 'Cash', 'Card', 'Net banking', 'Other'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
          <label className="block text-sm font-medium text-ink">Note (optional)<input maxLength="300" value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" /></label>
          {error && <p role="alert" className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button type="submit" disabled={isSaving || invalidAmount || fromMember === toMember} className="btn-primary disabled:opacity-50">{isSaving ? 'Saving…' : 'Save settlement'}</button></div>
        </form>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, detail, tone = 'normal' }) {
  return <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><p className="text-sm text-ink-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone === 'red' ? 'text-clay' : tone === 'green' ? 'text-teal' : 'text-ink'}`}>{value}</p><p className="mt-1 text-xs text-ink-400">{detail}</p></article>;
}

function CategoryIcon({ category }) {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold" style={{ color: category.color, backgroundColor: `${category.color}18` }} aria-hidden="true">{category.icon}</span>;
}

function EmptyState({ title, body, action, onAction }) {
  return <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-7 text-center"><p className="font-semibold text-ink">{title}</p><p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{body}</p>{action && <button type="button" onClick={onAction} className="mt-4 btn-primary">{action}</button>}</div>;
}

function BudgetLoading() {
  return <div className="space-y-4" role="status" aria-live="polite"><p className="text-sm text-ink-500">Loading budget…</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-stone-100" />)}</div></div>;
}

function BudgetLoadError({ message, retry }) {
  return <div className="rounded-xl border border-clay/30 bg-clay/5 p-5"><p className="font-semibold text-clay">Budget could not be loaded</p><p className="mt-1 text-sm text-ink-600">{message}</p><button type="button" onClick={retry} className="mt-3 btn-secondary">Retry</button></div>;
}

function ratio(item) {
  if (!item.plannedPaise) return item.actualPaise ? Number.POSITIVE_INFINITY : 0;
  return item.actualPaise / item.plannedPaise;
}

function statusColor(status, totalBudgetPaise) {
  if (!totalBudgetPaise) return '#a8a29e';
  if (status === 'over') return '#dc2626';
  if (status === 'approaching') return '#d97706';
  return '#0f766e';
}

function healthTone(status, totalBudgetPaise) {
  if (!totalBudgetPaise) return 'bg-stone-100 text-ink-600';
  if (status === 'over') return 'bg-clay/10 text-clay';
  if (status === 'approaching') return 'bg-marigold-50 text-marigold-700';
  return 'bg-teal/10 text-teal';
}

function healthTitle(status, totalBudgetPaise) {
  if (!totalBudgetPaise) return 'No trip budget set';
  if (status === 'none') return 'No expenses yet';
  if (status === 'over') return 'Over budget';
  if (status === 'approaching') return 'Approaching limit';
  return 'On track';
}

function healthDescription(budget) {
  if (!budget.totalBudgetPaise) return 'Add a trip budget to track spending progress against a planned amount.';
  if (budget.status === 'none') return 'No actual expenses have been recorded for this trip.';
  if (budget.status === 'over') return `${formatExactPaise(Math.abs(budget.remainingPaise))} above the total budget.`;
  if (budget.status === 'approaching') return `${budget.progressPct}% spent; ${formatExactPaise(budget.remainingPaise)} remains.`;
  return `${formatExactPaise(budget.remainingPaise)} remains in the trip budget.`;
}

function formatDisplayDate(date) {
  if (!date) return 'Date unavailable';
  const [year, month, day] = String(date).slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseInrText(value) {
  const match = String(value || '').trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const total = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

function paiseToInput(value) {
  const paise = BigInt(value || 0);
  return `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;
}
