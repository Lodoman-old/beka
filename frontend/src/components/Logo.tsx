import { ReactNode, useEffect, useState } from 'react';
import { obtenerBaseUrl } from '../api/client';

let cacheLogo: Promise<boolean> | null = null;

export function hayLogo(): Promise<boolean> {
  if (!cacheLogo) {
    cacheLogo = fetch(`${obtenerBaseUrl()}/api/config/logo`)
      .then((r) => r.ok)
      .catch(() => false);
  }
  return cacheLogo;
}

export default function Logo({
  alto = 'h-12',
  redondeado = 'rounded-2xl',
  children,
}: {
  alto?: string;
  redondeado?: string;
  children?: ReactNode;
}) {
  const [hay, setHay] = useState<boolean | null>(null);
  useEffect(() => {
    void hayLogo().then(setHay);
  }, []);

  if (hay) {
    return (
      <div
        className={`inline-flex items-center justify-center bg-white shadow-lg ${redondeado} px-2 py-1`}
      >
        <img
          src={`${obtenerBaseUrl()}/api/config/logo`}
          referrerPolicy="no-referrer"
          alt="Logo del negocio"
          className={`${alto} w-auto object-contain`}
        />
      </div>
    );
  }

  return <>{children}</>;
}