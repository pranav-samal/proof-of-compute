/**
 * errors.ts — Shared error response helpers.
 * Error format from SPEC.md §8: { error: { code, message } }
 */
import { Response } from 'express';

export function notFound(res: Response, msg: string): Response {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: msg } });
}

export function badRequest(res: Response, msg: string, code = 'INVALID_REQUEST'): Response {
  return res.status(400).json({ error: { code, message: msg } });
}

export function serverError(res: Response, msg: string): Response {
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
}

export function serviceUnavailable(res: Response, msg: string): Response {
  return res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: msg } });
}
