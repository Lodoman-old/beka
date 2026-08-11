import { Pool, types } from 'pg';
import { env } from '../config/env';

types.setTypeParser(1700, (valor: string) => parseFloat(valor));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function verificarConexion(): Promise<void> {
  await pool.query('SELECT 1');
  console.log('[db] conexion a PostgreSQL establecida');
}