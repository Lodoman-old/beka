import { env } from './config/env';
import { pool, verificarConexion } from './db/pool';
import { ejecutarMigraciones } from './db/migrate';
import { crearApp } from './app';
import { asegurarConfiguracionBase } from './services/sistema.service';
import { asegurarUsuarioAdmin } from './services/auth.service';
import { inicializarWhatsApp, detenerWhatsApp } from './services/whatsapp.service';

async function principal(): Promise<void> {
  await verificarConexion();
  await ejecutarMigraciones();
  await asegurarConfiguracionBase();
  await asegurarUsuarioAdmin();

  const app = crearApp();
  const servidor = app.listen(env.PORT, () => {
    console.log(`[api] BEKA escuchando en el puerto ${env.PORT}`);
  });

  inicializarWhatsApp();

  const apagado = async (senal: string) => {
    console.log(`[api] recibida senal ${senal}, apagando...`);
    detenerWhatsApp();
    servidor.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void apagado('SIGINT'));
  process.on('SIGTERM', () => void apagado('SIGTERM'));
}

principal().catch((e) => {
  console.error('[api] error fatal al arrancar:', e);
  process.exit(1);
});