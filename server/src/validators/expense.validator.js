const { z } = require('zod');
const { isValidDateOnly } = require('../utils/dateOnly');

const memberIdSchema = z.string().trim().min(1).max(100);
const decimalValueSchema = z.union([
  z.string().trim().regex(/^(?:\d+\.?\d*|\.\d+)$/).max(30),
  z.number().finite().nonnegative(),
]);
const dateSchema = z.string().refine(isValidDateOnly, 'Enter a valid YYYY-MM-DD date.');
const receiptSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Receipt reference is invalid.').nullable().optional();

const expenseFields = {
  amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  category: z.enum(['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous']),
  description: z.string().trim().max(300).nullable().optional(),
  date: dateSchema,
  paidBy: memberIdSchema,
  paymentMethod: z.enum(['UPI', 'Cash', 'Card', 'Net banking', 'Other']),
  splitType: z.enum(['equal', 'exact', 'percent', 'shares']).default('equal'),
  splits: z.array(z.object({
    memberId: memberIdSchema,
    value: decimalValueSchema.optional().nullable(),
  }).strict()).min(1).max(100),
  receipt: receiptSchema,
};

const expenseCreateSchema = z.object(expenseFields).strict();
const expenseUpdateSchema = z.object(expenseFields)
  .partial()
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, 'At least one expense field is required.');
const expenseSplitPreviewSchema = z.object({
  amountPaise: expenseFields.amountPaise,
  splitType: expenseFields.splitType,
  splits: expenseFields.splits,
}).strict();

const settlementFields = {
  fromMember: memberIdSchema,
  toMember: memberIdSchema,
  amountPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  date: dateSchema,
  method: z.enum(['UPI', 'Cash', 'Card', 'Net banking', 'Other']),
  note: z.string().trim().max(300).nullable().optional(),
};
const settlementCreateSchema = z.object(settlementFields).strict();
const settlementUpdateSchema = z.object(settlementFields)
  .partial()
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, 'At least one settlement field is required.');

const tripIdParamSchema = z.object({ tripId: z.string().regex(/^[a-f\d]{24}$/i) });
const expenseIdParamSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const expenseListQuerySchema = z.object({
  category: z.enum(['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous']).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  day: z.union([z.coerce.number().int().positive(), z.enum(['before', 'after'])]).optional(),
  personId: memberIdSchema.optional(),
  paymentMethod: z.enum(['UPI', 'Cash', 'Card', 'Net banking', 'Other']).optional(),
  search: z.string().trim().max(100).optional(),
  groupByDay: z.preprocess((value) => (
    value === undefined ? undefined
      : value === 'true' || value === true ? true
        : value === 'false' || value === false ? false
          : value
  ), z.boolean()).optional(),
}).strict().refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: '`from` must be on or before `to`.',
});
const reportQuerySchema = z.object({
  type: z.enum(['full', 'person', 'category', 'day']).default('full'),
  personId: memberIdSchema.optional(),
  category: z.enum(['transport', 'accommodation', 'food', 'activities', 'shopping', 'miscellaneous']).optional(),
  day: z.union([z.coerce.number().int().positive(), z.enum(['before', 'after'])]).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  paymentMethod: z.enum(['UPI', 'Cash', 'Card', 'Net banking', 'Other']).optional(),
}).strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '`from` must be on or before `to`.',
  })
  .refine((query) => query.type !== 'category' || Boolean(query.category), {
    message: 'A category is required for category reports.',
    path: ['category'],
  });
const reportTripIdParamSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const receiptParamsSchema = z.object({
  tripId: z.string().regex(/^[a-f\d]{24}$/i),
  receiptId: z.string().regex(/^[a-f\d]{24}$/i),
});

module.exports = {
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseSplitPreviewSchema,
  settlementCreateSchema,
  settlementUpdateSchema,
  tripIdParamSchema,
  expenseIdParamSchema,
  expenseListQuerySchema,
  reportQuerySchema,
  reportTripIdParamSchema,
  receiptParamsSchema,
};
