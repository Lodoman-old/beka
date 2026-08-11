import { api } from '../api/client';

export function comprimirImagen(archivo: File, maxLado = 900, calidad = 0.82): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.max(1, Math.round(img.width * escala));
      lienzo.height = Math.max(1, Math.round(img.height * escala));
      const ctx = lienzo.getContext('2d');
      if (!ctx) {
        rechazar(new Error('No se pudo procesar la imagen'));
        return;
      }
      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      resolver(lienzo.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('El archivo no es una imagen válida'));
    };
    img.src = url;
  });
}

export async function subirImagenProducto(archivo: File): Promise<string> {
  const dataUrl = await comprimirImagen(archivo);
  const r = await api.post<{ url: string }>('/catalogo/imagen', { imagen: dataUrl });
  return r.url;
}

export function descripcionPeso(archivo: File): string {
  if (archivo.size < 1024 * 1024) return `${Math.round(archivo.size / 1024)} KB`;
  return `${(archivo.size / (1024 * 1024)).toFixed(1)} MB`;
}