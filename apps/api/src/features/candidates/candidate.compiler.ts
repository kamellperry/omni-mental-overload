import { Prisma } from '../../generated/prisma/client';

export interface CompiledCriteria {
  where: Prisma.Sql;
  whereText: string;
}

type MinimalCriteria = {
  min_followers?: number;
  max_followers?: number;
  has_link?: boolean;
  activity_within_days?: number; // recency window for recentActivityAt
};

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function coerceBoolean(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(s)) return true;
    if (['false', '0', 'no'].includes(s)) return false;
  }
  return undefined;
}

export function compileCriteria(criteria: unknown): CompiledCriteria {
  const obj: Readonly<Record<string, unknown>> =
    typeof criteria === 'object' && criteria !== null ? (criteria as Record<string, unknown>) : {};

  const parts: string[] = [];
  const sqlParts: Prisma.Sql[] = [];

  const minF = coerceNumber(obj['min_followers']);
  if (minF !== undefined) {
    parts.push(`pf.followers >= ${minF}`);
    sqlParts.push(Prisma.sql`AND pf.followers >= ${minF}`);
  }

  const maxF = coerceNumber(obj['max_followers']);
  if (maxF !== undefined) {
    parts.push(`pf.followers <= ${maxF}`);
    sqlParts.push(Prisma.sql`AND pf.followers <= ${maxF}`);
  }

  const hasLink = coerceBoolean(obj['has_link']);
  if (hasLink !== undefined) {
    parts.push(`pf."hasLink" = ${hasLink}`);
    sqlParts.push(Prisma.sql`AND pf."hasLink" = ${hasLink}`);
  }

  const withinDays = coerceNumber(obj['activity_within_days']);
  if (withinDays !== undefined && withinDays > 0) {
    const cutoff = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
    parts.push(`pf."recentActivityAt" >= '${cutoff.toISOString()}'`);
    sqlParts.push(Prisma.sql`AND pf."recentActivityAt" >= ${cutoff}`);
  }

  const whereText = parts.length ? parts.join(' AND ') : 'TRUE';
  let combined: Prisma.Sql = Prisma.sql``;
  for (const s of sqlParts) {
    combined = Prisma.sql`${combined} ${s}`;
  }
  const whereSql: Prisma.Sql = sqlParts.length ? Prisma.sql`TRUE ${combined}` : Prisma.sql`TRUE`;

  return { where: whereSql, whereText };
}
