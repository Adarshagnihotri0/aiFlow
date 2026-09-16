import { z } from 'zod';
import { limits } from '../public/limits.js';

export const id = z.string().regex(/^[a-z][a-z0-9-]{1,79}$/);
const text = (max) => z.string().trim().min(1).max(max);
export const profileSchema = z.object({
  role: z.enum(['android', 'frontend', 'backend', 'undecided']),
  level: z.enum(['beginner', 'some-basics']),
  minutes: z.union([z.literal(15), z.literal(25), z.literal(45)]),
  language: z.enum(['english', 'hinglish']), aiConsent: z.boolean(),
  learningStyle: z.enum(['standard', 'focused']).optional(),
}).strict();
export const profileDefault = { role: 'undecided', level: 'beginner', minutes: 25, language: 'english', aiConsent: false };
export const sessionSchema = z.object({
  id: id.max(64), title: text(160), date: z.string().datetime(), status: z.enum(['complete', 'incomplete']),
  summary: text(2000), why: text(2000), changes: z.array(text(700)).min(1).max(15),
  concepts: z.array(text(80)).max(12), exercise: text(1500),
  evidence: z.array(z.object({ label: text(240), state: z.enum(['reported', 'verified', 'failed', 'not-run']), reference: text(500) }).strict()).min(1).max(15),
  sourceIds: z.array(id).min(1).max(12),
  supersedes: id.max(64).optional(),
  teaching: z.object({ plainExplanation: text(2000), example: text(2000), checkQuestion: text(500), checkAnswer: text(2000) }).strict().optional(),
}).strict();
export const reviewSchema = z.object({ cardId: id, rating: z.enum(['again', 'hard', 'good', 'easy']), requestId: z.string().uuid() }).strict();
export const progressSchema = z.object({ lessonId: id, step: z.enum(['read', 'attempted']) }).strict();
export const chatSchema = z.object({
  question: text(limits.question), mode: z.enum(['teach', 'guide', 'interview']), lessonId: id.optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: text(limits.historyEntry) }).strict()).max(limits.history).default([]),
}).strict();
const reviewValueSchema = z.object({ due: z.number().finite().nonnegative(), interval: z.number().finite().nonnegative(), reps: z.number().int().nonnegative(), fingerprint: z.string() }).strict();
export const stateSchema = z.object({
  version: z.literal(1), profile: profileSchema,
  reviews: z.record(id, reviewValueSchema),
  progress: z.record(id, z.object({ read: z.boolean().optional(), attempted: z.boolean().optional() }).strict()),
  receipts: z.array(z.object({ requestId: z.string().uuid(), cardId: id, rating: z.enum(['again', 'hard', 'good', 'easy']), review: reviewValueSchema }).strict()).max(256).refine((items) => new Set(items.map((item) => item.requestId)).size === items.length, 'Review receipt IDs must be unique.'),
  sessions: z.array(sessionSchema).max(200),
}).strict();

// Defense in depth, not a promise to recognize every secret. Only curate approved material.
export function redact(value) {
  return value
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED KEY]')
    .replace(/\b(?:sk-(?:proj-)?|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED TOKEN]')
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED TOKEN]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED JWT]')
    .replace(/((?:api[_-]?key|password|secret|access[_-]?token)\s*["']?\s*[:=]\s*)["']?[^\s,"'}]+["']?/gi, '$1[REDACTED]')
    .replace(/\/Users\/[^\s/]+/g, '[HOME]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED EMAIL]');
}
export function validateSession(input, sourceIds) {
  const session = sessionSchema.parse(input);
  if (session.sourceIds.some((source) => !sourceIds.includes(source))) throw new Error('Session references an unapproved source ID.');
  if (redact(JSON.stringify(session)) !== JSON.stringify(session)) throw new Error('Session contains potentially sensitive content; curate it before publishing.');
  return session;
}