import fs from 'fs';
import path from 'path';
import { pool } from './pool';

export async function ejecutarMigraciones(): Promise<void> {
  const dir = path.join(__dirname, '..', 'sql');
  const archivos = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const archivo of archivos) {
    const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
    await pool.query(sql);
    console.log(`[migracion] ${archivo} aplicada correctamente`);
  }
}