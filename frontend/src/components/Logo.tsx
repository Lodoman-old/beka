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
  children,
}: {
  alto?: string;
  children?: ReactNode;
}) {
  const [hay, setHay] = useState<boolean | null>(null);
  useEffect(() => {
    void hayLogo().then(setHay);
  }, []);

  if (hay) {
    return (
      <img
        src={`${obtenerBaseUrl()}/api/config/logo`}
        referrerPolicy="no-referrer"
        alt="Logo del negocio"
        className={`${alto} w-auto object-contain`}
      />
    );
  }

  return <>{children}</>;
}