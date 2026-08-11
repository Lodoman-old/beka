export function moneda(cantidad: number): string {
  return cantidad.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function corto(cantidad: number): string {
  return cantidad.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function horaCorta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function fechaHora(iso: string): string {
  return `${fechaCorta(iso)} ${horaCorta(iso)}`;
}

export function etiquetaMes(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  const d = new Date(anio, mes - 1, 1);
  return d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
}

export function inicioDeMes(): string {
  const ahora = new Date();
  const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  return inicio.toISOString();
}

export function vaciarTexto(telefono: string | null): string {
  return telefono && telefono.replace(/\D/g, '').length >= 10
    ? telefono.replace(/\D/g, '')
    : '';
}

export function msjError(e: unknown): string {
  return e instanceof Error ? e.message : 'Error inesperado';
}