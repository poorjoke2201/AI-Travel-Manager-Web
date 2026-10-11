import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../services/api';
import { BUDGET_CATEGORIES } from '../../../config/budgetCategories';
import {
  addDateDays,
  dateForTripDay,
  formatExactPaise,
  fromDisplayDate,
  todayDateOnly,
  toDisplayDate,
  tripDayForDate,
} from '../../../utils/budgetUtils';
import { validateExpenseSplitForm } from '../../../utils/expenseFormValidation';

const PAYMENT_METHODS = ['UPI', 'Cash', 'Card', 'Net banking', 'Other'];

function paiseInput(value) {
  const paise = BigInt(value || 0);
  return `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;
}

function initialForm(expense, members, userId, trip) {
  const today = todayDateOnly();
  const memberId = members.some((member) => member.memberId === userId)
    ? userId
    : members[0]?.memberId || '';
  if (expense) {
    return {
      amount: paiseInput(expense.amountPaise),
      category: expense.category,
      description: expense.description || '',
      date: expense.date,
      dateText: toDisplayDate(expense.date),
      paymentMethod: expense.paymentMethod,
      paidBy: String(expense.paidBy),
      splitType: expense.splitType,
      receipt: expense.receipt || null,
      splits: expense.splits.map((split) => ({
        memberId: String(split.memberId),
        value: split.value == null ? '' : String(split.value),
      })),
    };
  }
  const defaultDate = today;
  return {
    amount: '',
    category: 'food',
    description: '',
    date: defaultDate,
    dateText: toDisplayDate(defaultDate),
    paymentMethod: 'UPI',
    paidBy: memberId || String(trip?.tripOwnerId || ''),
    splitType: 'equal',
    receipt: null,
    splits: members.map((member) => ({ memberId: member.memberId, value: '' })),
  };
}

export default function ExpenseDrawer({ expense, trip, members, userId, onClose, onSave }) {
  const [form, setForm] = useState(() => initialForm(expense, members, userId, trip));
  const [preview, setPreview] = useState({ splits: [], error: null, loading: false });
  const [fieldError, setFieldError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [receiptPreviewError, setReceiptPreviewError] = useState('');
  const panelRef = useRef(null);
  const receiptInputRef = useRef(null);
  const previewRequestId = useRef(0);
  const splitValidation = validateExpenseSplitForm(form.amount, form.splitType, form.splits);
  const amountPaise = splitValidation.amountPaise;
  const dayCount = trip?.tripDays || 0;
  const dayOptions = useMemo(() => {
    const options = [];
    if (trip?.startDate && trip?.endDate) {
      options.push({ value: 'before', label: `Before trip · ${toDisplayDate(addDateDays(trip.startDate, -1))}` });
      for (let day = 1; day <= dayCount; day += 1) {
        const date = dateForTripDay(day, trip.startDate, trip.endDate);
        const labelDate = new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
        options.push({ value: String(day), label: `Day ${day} · ${labelDate}` });
      }
      options.push({ value: 'after', label: `After trip · ${toDisplayDate(addDateDays(trip.endDate, 1))}` });
    }
    return options;
  }, [dayCount, trip?.endDate, trip?.startDate]);
  const selectedDay = tripDayForDate(form.date, trip?.startDate, trip?.endDate);
  const selectedSplits = form.splits;
  const splitValid = splitValidation.valid;
  const allocationMessage = splitValidation.allocationMessage;
  const allocationError = splitValidation.error;
  const previewReady = splitValid && !preview.loading && !preview.error && preview.splits.length === selectedSplits.length;
  const submitDisabled = isSaving || !previewReady || !form.date || Boolean(fieldError);
  const submitReason = isSaving ? 'Saving expense…'
    : !form.date ? 'Enter a valid date.'
      : allocationError || preview.error || (!previewReady ? 'Calculating the split preview…' : '');

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const firstInput = panel.querySelector('input:not([type="checkbox"]), select, textarea, button');
    firstInput?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(panel.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const requestId = ++previewRequestId.current;
    if (!splitValid || !amountPaise) {
      setPreview({ splits: [], error: null, loading: false });
      return undefined;
    }
    setPreview((current) => ({ ...current, error: null, loading: true }));
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.post(`/trips/${trip.tripId}/expenses/preview-split`, {
          amountPaise,
          splitType: form.splitType,
          splits: selectedSplits.map(({ memberId, value }) => ({
            memberId,
            ...(form.splitType === 'equal' ? {} : { value }),
          })),
        });
        if (requestId === previewRequestId.current) {
          setPreview({ splits: response.data.data.splits, error: null, loading: false });
        }
      } catch (error) {
        if (requestId === previewRequestId.current) {
          setPreview({ splits: [], error: error.message, loading: false });
        }
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [amountPaise, form.splitType, selectedSplits, splitValid, trip.tripId]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setReceiptPreviewError('');
    setReceiptPreviewUrl('');
    if (receiptFile) {
      objectUrl = URL.createObjectURL(receiptFile);
      setReceiptPreviewUrl(objectUrl);
    } else if (form.receipt && !removeReceipt) {
      api.get(`/trips/${trip.tripId}/receipts/${form.receipt}`, { responseType: 'blob' })
        .then((response) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(response.data);
          setReceiptPreviewUrl(objectUrl);
        })
        .catch((error) => {
          if (active) setReceiptPreviewError(error.message);
        });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [form.receipt, receiptFile, removeReceipt, trip.tripId]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldError('');
    setRequestError('');
  }

  function selectReceipt(file) {
    setRequestError('');
    if (!file) {
      setReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
      setRequestError('Choose a JPEG or PNG receipt image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
      setRequestError('Receipt images must be 5 MB or smaller.');
      return;
    }
    setReceiptFile(file);
    setRemoveReceipt(false);
  }

  function toggleMember(memberId) {
    setForm((current) => {
      const exists = current.splits.some((split) => split.memberId === memberId);
      const splits = exists
        ? current.splits.filter((split) => split.memberId !== memberId)
        : [...current.splits, { memberId, value: '' }];
      return { ...current, splits };
    });
  }

  function updateMemberValue(memberId, value) {
    setForm((current) => ({
      ...current,
      splits: current.splits.map((split) => split.memberId === memberId ? { ...split, value } : split),
    }));
  }

  function changeDateText(value) {
    const parsed = fromDisplayDate(value);
    setForm((current) => ({
      ...current,
      dateText: value,
      ...(parsed ? { date: parsed } : {}),
    }));
    setFieldError(parsed ? '' : 'Use DD-MM-YYYY for the expense date.');
  }

  function changeDay(value) {
    const date = dateForTripDay(value, trip?.startDate, trip?.endDate);
    if (!date) return;
    setForm((current) => ({ ...current, date, dateText: toDisplayDate(date) }));
    setFieldError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!previewReady || !amountPaise) return;
    const parsedDate = fromDisplayDate(form.dateText);
    if (!parsedDate) {
      setFieldError('Use DD-MM-YYYY for the expense date.');
      return;
    }
    setIsSaving(true);
    setRequestError('');
    let uploadedReceiptId = null;
    try {
      let receipt = removeReceipt ? null : form.receipt;
      if (receiptFile) {
        const receiptForm = new FormData();
        receiptForm.append('receipt', receiptFile);
        const uploadResponse = await api.post(`/trips/${trip.tripId}/receipts`, receiptForm);
        uploadedReceiptId = uploadResponse.data.data._id;
        receipt = uploadedReceiptId;
      }
      await onSave({
        amountPaise,
        category: form.category,
        description: form.description.trim() || null,
        date: parsedDate,
        paidBy: form.paidBy,
        paymentMethod: form.paymentMethod,
        splitType: form.splitType,
        splits: preview.splits.map(({ memberId, value }) => ({
          memberId,
          ...(value == null ? {} : { value }),
        })),
        receipt,
      });
    } catch (error) {
      if (uploadedReceiptId) {
        try {
          await api.delete(`/trips/${trip.tripId}/receipts/${uploadedReceiptId}`);
        } catch (cleanupError) {
          setRequestError(`${error.message} The unused receipt could not be removed: ${cleanupError.message}`);
          return;
        }
      }
      setRequestError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-ink/45" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-drawer-title"
        className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-stone-200 px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ocean">Trip budget</p>
            <h2 id="expense-drawer-title" className="mt-1 text-xl font-semibold text-ink">{expense ? 'Edit expense' : 'Add expense'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close expense form" className="rounded-md px-3 py-2 text-ink-500 hover:bg-stone-100">✕</button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-ink">Amount <span className="text-clay">*</span></span>
                <div className="flex items-center rounded-md border border-stone-300 focus-within:border-ocean">
                  <span className="pl-3 text-ink-500">₹</span>
                  <input autoComplete="off" inputMode="decimal" required aria-label="Amount in rupees" value={form.amount} onChange={(event) => updateForm('amount', event.target.value)} placeholder="0.00" className="w-full rounded-md border-0 px-2 py-2 outline-none focus:ring-0" />
                </div>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-ink">Category <span className="text-clay">*</span></span>
                <select required value={form.category} onChange={(event) => updateForm('category', event.target.value)} className="w-full rounded-md border border-stone-300 px-3 py-2">
                  {BUDGET_CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-ink">Payment method <span className="text-clay">*</span></span>
                <select required value={form.paymentMethod} onChange={(event) => updateForm('paymentMethod', event.target.value)} className="w-full rounded-md border border-stone-300 px-3 py-2">
                  {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-ink">Date <span className="text-clay">*</span></span>
                <input required inputMode="numeric" placeholder="DD-MM-YYYY" value={form.dateText} onChange={(event) => changeDateText(event.target.value)} aria-describedby="expense-date-help" className="w-full rounded-md border border-stone-300 px-3 py-2" />
                <span id="expense-date-help" className="mt-1 block text-xs text-ink-400">Enter DD-MM-YYYY.</span>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-ink">Trip day</span>
                <select value={selectedDay === 'custom' || selectedDay === '' ? 'custom' : String(selectedDay)} onChange={(event) => changeDay(event.target.value)} className="w-full rounded-md border border-stone-300 px-3 py-2">
                  <option value="custom">Custom date</option>
                  {dayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-ink">Paid by <span className="text-clay">*</span></span>
                <select required value={form.paidBy} onChange={(event) => updateForm('paidBy', event.target.value)} className="w-full rounded-md border border-stone-300 px-3 py-2">
                  {members.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-ink">Description</span>
                <input maxLength="300" value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="What was this expense for?" className="w-full rounded-md border border-stone-300 px-3 py-2" />
              </label>
            </div>

            <section aria-labelledby="split-title" className="rounded-xl border border-stone-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 id="split-title" className="font-semibold text-ink">Split expense</h3>
                  <p className="mt-1 text-xs text-ink-500">The payer can be excluded from the people who owe a share.</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={() => setForm((current) => ({ ...current, splits: members.map((member) => current.splits.find((split) => split.memberId === member.memberId) || { memberId: member.memberId, value: '' }) }))} className="font-medium text-ocean hover:underline">Select all</button>
                  <button type="button" onClick={() => setForm((current) => ({ ...current, splits: [] }))} className="font-medium text-ocean hover:underline">Clear</button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 rounded-lg bg-stone-100 p-1" role="group" aria-label="Split type">
                {[
                  ['equal', 'Equal'],
                  ['exact', 'Exact'],
                  ['percent', 'Percent'],
                  ['shares', 'Shares'],
                ].map(([type, label]) => (
                  <button key={type} type="button" onClick={() => updateForm('splitType', type)} aria-pressed={form.splitType === type} className={`rounded-md px-2 py-2 text-xs font-semibold sm:text-sm ${form.splitType === type ? 'bg-white text-ocean shadow-sm' : 'text-ink-500 hover:text-ink'}`}>{label}</button>
                ))}
              </div>

              <div className="mt-3 divide-y divide-stone-100">
                {members.map((member) => {
                  const split = form.splits.find((item) => item.memberId === member.memberId);
                  const share = preview.splits.find((item) => item.memberId === member.memberId)?.sharePaise;
                  return (
                    <div key={member.memberId} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_145px_100px]">
                      <label className="flex min-w-0 items-center gap-2 text-sm">
                        <input type="checkbox" checked={Boolean(split)} onChange={() => toggleMember(member.memberId)} className="h-4 w-4 rounded border-stone-300 text-ocean focus:ring-ocean" />
                        <span className="truncate">{member.name}</span>
                      </label>
                      {split && form.splitType !== 'equal' ? (
                        <div className="relative">
                          {form.splitType !== 'shares' && <span className="absolute left-2 top-2 text-xs text-ink-400">{form.splitType === 'exact' ? '₹' : '%'}</span>}
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={`${form.splitType} value for ${member.name}`}
                            value={split.value}
                            onChange={(event) => updateMemberValue(member.memberId, event.target.value)}
                            placeholder={form.splitType === 'shares' ? '1' : '0.00'}
                            className={`w-full rounded-md border border-stone-300 py-2 text-sm ${form.splitType === 'shares' ? 'px-2' : 'pl-6 pr-2'}`}
                          />
                        </div>
                      ) : <span className="text-xs text-ink-300">{split ? 'Equal share' : ''}</span>}
                      <span className="text-right text-xs font-semibold text-ink-600">{split && share !== undefined ? formatExactPaise(share) : '—'}</span>
                    </div>
                  );
                })}
              </div>

              <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${allocationError ? 'bg-clay/10 text-clay' : 'bg-teal/10 text-teal'}`} aria-live="polite">
                <p className="font-medium">{allocationError || allocationMessage || 'Enter split values to preview allocation.'}</p>
                {preview.loading && !allocationError && <p className="mt-1 text-xs">Calculating exact shares…</p>}
                {preview.error && <p className="mt-1 text-xs">{preview.error}</p>}
              </div>
              {fieldError && <p className="mt-2 text-sm text-clay" role="alert">{fieldError}</p>}
            </section>

            <section aria-labelledby="receipt-title" className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3">
              <h3 id="receipt-title" className="text-sm font-medium text-ink-600">Optional receipt image</h3>
              <p className="mt-1 text-xs text-ink-400">Private JPEG or PNG image, up to 5 MB. Attached images are included in budget PDFs.</p>
              {form.receipt && !removeReceipt && !receiptFile && (
                <div className="mt-2 flex items-center justify-between gap-3 text-sm text-ink-600">
                  <span>Receipt attached</span>
                  <button type="button" onClick={() => setRemoveReceipt(true)} className="font-medium text-clay hover:underline">Remove</button>
                </div>
              )}
              {receiptPreviewUrl && form.receipt && !receiptFile && !removeReceipt && (
                <img src={receiptPreviewUrl} alt="Attached receipt preview" className="mt-3 max-h-48 max-w-full rounded-md border border-stone-200 object-contain" />
              )}
              {receiptPreviewError && !removeReceipt && <p role="alert" className="mt-2 text-xs text-clay">Receipt preview could not be loaded: {receiptPreviewError}</p>}
              {receiptFile && (
                <div className="mt-2 flex items-center justify-between gap-3 text-sm text-ink-600">
                  <span className="truncate">{receiptFile.name}</span>
                  <button type="button" onClick={() => selectReceipt(null)} className="font-medium text-clay hover:underline">Clear</button>
                </div>
              )}
              {receiptPreviewUrl && receiptFile && <img src={receiptPreviewUrl} alt="Selected receipt preview" className="mt-3 max-h-48 max-w-full rounded-md border border-stone-200 object-contain" />}
              {removeReceipt && !receiptFile && <p className="mt-2 text-xs text-ink-500">The attached receipt will be removed when this expense is saved.</p>}
              <label className="mt-3 block">
                <span className="sr-only">Choose receipt image</span>
                <input ref={receiptInputRef} type="file" accept="image/jpeg,image/png" onChange={(event) => selectReceipt(event.target.files?.[0] || null)} className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:font-medium file:text-ink shadow-sm" />
              </label>
            </section>

            {requestError && <p role="alert" className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{requestError}</p>}
          </div>
          <footer className="sticky bottom-0 border-t border-stone-200 bg-white px-5 py-4 sm:px-7">
            {submitDisabled && submitReason && <p className="mb-2 text-xs text-clay" aria-live="polite">{submitReason}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={submitDisabled} className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
