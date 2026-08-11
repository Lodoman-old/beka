import { Request, Response, NextFunction, RequestHandler } from 'express';

export class AppError extends Error {
  status: number;
  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

export function envolver(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function numeroPositivo(valor: unknown, campo: string): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError(400, `El campo ${campo} debe ser un numero mayor a cero`);
  }
  return n;
}

export function enteroPositivo(valor: unknown, campo: string): number {
  const n = numeroPositivo(valor, campo);
  if (!Number.isInteger(n)) {
    throw new AppError(400, `El campo ${campo} debe ser un entero`);
  }
  return n;
}

export function stringObligatorio(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new AppError(400, `El campo ${campo} es obligatorio`);
  }
  return valor.trim();
}

export function opcionalTexto(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.trim().length === 0) return null;
  return valor.trim();
}

export function fechaValida(valor: unknown, campo: string): Date {
  const f = new Date(String(valor));
  if (Number.isNaN(f.getTime())) {
    throw new AppError(400, `El campo ${campo} tiene una fecha invalida`);
  }
  return f;
}

export function manejarError(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const e = err as { code?: string; message?: string };
  if (e?.code === '23505') {
    res.status(409).json({ error: 'Registro duplicado: ya existe un elemento con esos datos' });
    return;
  }
  if (e?.code === '23503') {
    res.status(409).json({ error: 'No se puede eliminar: el registro tiene datos relacionados' });
    return;
  }
  console.error('[error]', e);
  res.status(500).json({ error: 'Error interno del servidor' });
}

export function paginacion(query: Record<string, unknown>): { limite: number; offset: number } {
  const limite = Math.min(Number(query.limite) || 50, 500);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limite, offset };
}