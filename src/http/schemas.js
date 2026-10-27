'use strict';

const { z } = require('zod');
const { STAGES } = require('../domain/deals');

const trimmed = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const id = z.coerce.number().int().positive();

const loginBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

const createContactBody = z.object({
  name: trimmed(200),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  phone: optionalText(40).refine((v) => v === null || /^[0-9+()\-.\s]{3,40}$/.test(v), {
    message: 'phone may contain only digits, spaces and + ( ) - .',
  }),
  company_id: z.number().int().positive().optional().nullable(),
  tags: optionalText(500),
});

const createDealBody = z.object({
  title: trimmed(200),
  value: z.number().nonnegative(),
  stage: z.enum(STAGES).default('Lead'),
  contact_id: z.number().int().positive(),
  activity_notes: optionalText(5000),
});

const updateStageBody = z.object({ stage: z.enum(STAGES) });

const idParams = z.object({ id });

const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const anonymizeBody = z.object({
  confirm: z.literal('ANONYMIZE', {
    error: 'send {"confirm":"ANONYMIZE"} to confirm this irreversible operation',
  }),
  contact_id: z.number().int().positive().optional(),
});

module.exports = {
  loginBody,
  createContactBody,
  createDealBody,
  updateStageBody,
  idParams,
  pagination,
  anonymizeBody,
};
