import type { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'internal_error' });
};

