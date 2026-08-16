import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

export interface ApiResponse<T> {
  success: true;
  data: T;
}

// Defense in depth: even if a service accidentally returns a raw Prisma record
// containing one of these, it never reaches the response body. This is a backstop —
// call sites should still avoid selecting these fields in the first place — but a
// single missed call site (exactly what happened with GET /admin/users) must not
// be able to leak credentials.
const REDACTED_FIELDS = new Set(['passwordHash', 'tokenHash', 'codeHash']);

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return value;

  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => redact(item, seen));
  }

  // Only walk plain objects (Prisma model results, DTOs) — leave class instances
  // like Decimal alone so we don't break their serialization.
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;

  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_FIELDS.has(key)) continue;
    result[key] = redact(val, seen);
  }
  return result;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [context.getHandler(), context.getClass()]);
    if (isRaw) return next.handle();
    return next.handle().pipe(map((data) => ({ success: true, data: redact(data) as T })));
  }
}
