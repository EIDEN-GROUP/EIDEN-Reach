import { z } from 'zod'

export const contactInput = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().max(100),
  email: z.union([z.literal(''), z.email()]).transform(value => value || null),
})

export const companyInput = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(200),
  domain: z.union([z.literal(''), z.string().trim().max(253)]).transform(value => value || null),
  industry: z.union([z.literal(''), z.string().trim().max(100)]).optional().transform(value => value || null),
  location: z.union([z.literal(''), z.string().trim().max(160)]).optional().transform(value => value || null),
  employeeCount: z.union([z.literal(''), z.string().regex(/^\d{1,9}$/, 'Employee count must be a whole number')]).optional().transform(value => value ? Number(value) : null),
})

export const taskInput = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200),
  dueAt: z.union([z.literal(''), z.iso.datetime({ offset: true })]).transform(value => value || null),
})

export const noteInput = z.object({
  body: z.string().trim().min(1, 'Note text is required').max(4000, 'Note must be 4,000 characters or fewer'),
})

export const dealInput = z.object({
  name: z.string().trim().min(1, 'Deal name is required').max(200),
  amount: z.union([z.literal(''), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Amount must be a nonnegative value with up to 12 whole digits and 2 decimals')]).transform(value => value ? Number(value) : null),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  expectedCloseOn: z.union([z.literal(''), z.iso.date()]).optional().transform(value => value || null),
  nextAction: z.string().trim().max(200).optional().transform(value => value || null),
})

export const enrollmentState = z.enum(['pending', 'active', 'waiting', 'sending', 'paused', 'replied', 'completed', 'unsubscribed', 'bounced', 'cancelled', 'failed'])

export type ContactInput = z.infer<typeof contactInput>
export type CompanyInput = z.infer<typeof companyInput>
export type TaskInput = z.infer<typeof taskInput>
export type NoteInput = z.infer<typeof noteInput>
export type DealInput = z.infer<typeof dealInput>
