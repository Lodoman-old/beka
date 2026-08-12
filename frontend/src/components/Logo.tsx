import { ReactNode, useEffect, useState } from 'react';
import { obtenerBaseUrl } from '../api/client';

export default function Logo({
  alto = 'h-12',
  children,
}: {
  alto?: string;
  children?: ReactNode;
}) {
  const baseUrl = obtenerBaseUrl();
  const [hay, setHay] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!baseUrl) {
      setHay(false);
      return;
    }
    fetch(`${baseUrl}/api/config/logo`)
      .then((r) => {
        if (vivo) setHay(r.ok);
      })
      .catch(() => {
        if (vivo) setHay(false);
      });
    return () => {
      vivo = false;
    };
  }, [baseUrl]);

  if (!baseUrl || !hay) {
    return <>{children}</>;
  }

  return (
    <img
      src={`${baseUrl}/api/config/logo`}
      referrerPolicy="no-referrer"
      alt="Logo del negocio"
      className={`${alto} w-auto object-contain`}
    />
  );
}