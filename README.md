# BEKA · Sistema de gestión empresarial (ventas, abonos y viajes)

Sistema centralizado para negocio de ventas con abonos, organización de viajes y catálogo
sincronizado del portal NICE. Backend Node.js + TypeScript + Express + PostgreSQL (Docker),
notificaciones de WhatsApp automáticas, scraper invisible del catálogo NICE con Puppeteer, y
frontend React + Tailwind que se empaqueta como APK Android con Capacitor.

## Arquitectura

```
BEKA/
├── docker-compose.yml          # PostgreSQL + API en un solo comando
├── Dockerfile                  # build multi-etapa (frontend + backend + Chromium)
├── .env                        # variables secretas (NICE, PostgreSQL, margen, puerto)
├── backend/                    # API REST + scraper + bot WhatsApp
│   ├── src/
│   │   ├── index.ts            # arranque: migraciones + API + WhatsApp + cron
│   │   ├── app.ts              # configuración Express + frontend estático
│   │   ├── config/env.ts       # variables de entorno tipadas
│   │   ├── db/                 # pool de PostgreSQL y ejecutador de migraciones
│   │   ├── sql/                # esquema, triggers y seed
│   │   ├── routes/             # clientes, ventas, viajes, abonos, catalogo, reportes, config
│   │   ├── services/           # lógica de negocio (saldo automático, reportes, WhatsApp)
│   │   └── scraper/            # extractor invisible del catálogo NICE
│   └── scripts/sync-catalogo.ts# script independiente de sincronización
└── frontend/                   # React + Tailwind (web responsiva + APK)
    ├── capacitor.config.ts     # configuración del empaquetado Android
    └── src/pages/              # Dashboard, Clientes, Ventas, Viajes, Abonos, Catálogo, Config
```

## Lógica de saldos (automática en el backend + triggers SQL)

- Cada **abono** insertado dispara un trigger que recalcula `saldo_pendiente = total − Σ abonos`.
- Si el saldo llega a `0`, el estado conmuta a `LIQUIDADO` (venta o viaje).
- El total de un viaje se recalcula solo: `pasajeros × precio_por_pasajero`.
- El total y costo de una venta se recalculan desde sus detalles usando el precio público y
  el costo unitario del catálogo.
- Las ventas/viajes/pasajeros con abonos **no se pueden borrar** (integridad contable).

## Instalación en el VPS (Ubuntu 22.04/24.04)

```bash
# 1) Instalar Docker y el plugin de compose
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker

# 2) Subir el proyecto y configurar secretos
git clone <tu-repositorio> beka && cd beka
cp .env.example .env && nano .env
#   - Pon passwords fuertes en POSTGRES_PASSWORD, NICE_USER y NICE_PASS
#   - Ajusta NICE_URL_LOGIN y los selectores NICE_SEL_* al HTML real del portal
#   - Cambia MARGEN_GANANCIA si lo deseas (también editable desde la web)

# 3) Compilar y levantar (build multi-etapa: frontend + backend + Chromium)
docker compose up -d --build

# 4) Verificar migraciones y estado
docker compose logs -f api
#    Los logs mostrarán:
#    [db] conexion a PostgreSQL establecida
#    [migracion] 001_schema.sql aplicada correctamente
#    [migracion] 002_seed.sql aplicada correctamente
#    [api] BEKA escuchando en el puerto 4000

# 5) PRIMERA VEZ: vincular WhatsApp
#    En los logs aparece un código QR (solo la primera vez).
#    Escanéalo con el WhatsApp del negocio. La sesión queda guardada en un volumen
#    (wa_session) y no volverá a pedir QR, aunque el contenedor se reinicie.

# 6) Exponer la web de forma segura (recomendado: Caddy con TLS gratis)
#    En /etc/caddy/ añade:
#      tu-dominio.com {
#          reverse_proxy 127.0.0.1:4000
#      }
#    sudo apt install -y caddy && sudo systemctl enable --now caddy

# 7) Sincronizar el catálogo NICE (con el margen configurado)
docker compose exec api node dist/scripts/sync-catalogo.js
#    O desde la web: Configuración → Sincronizar catálogo ahora
#    O automático: define SCRAPE_CRON="0 3 * * *" en el .env y reinicia el contenedor
```

## Endpoints principales del API

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/clientes` | Listar (búsqueda) / crear clientes |
| PUT/DELETE | `/api/clientes/:id` | Editar / desactivar cliente |
| GET/POST | `/api/ventas` | Listar / crear venta (items con producto_id y cantidad) |
| GET | `/api/ventas/:id` | Venta con detalles |
| GET/POST | `/api/viajes` | Listar / crear viaje |
| GET | `/api/viajes/:id` | Viaje con pasajeros y saldos individuales |
| POST | `/api/viajes/:id/pasajeros` | Agregar pasajero con número de asiento (único por viaje) |
| GET/POST | `/api/abonos` | Listar / registrar abono (`venta_id` o `viaje_id` + `pasajero_id` opcional) |
| GET | `/api/catalogo?busqueda=` | Buscar productos del catálogo |
| GET | `/api/catalogo/sku/:sku` | Consulta por SKU (escáner de código de barras) |
| POST | `/api/catalogo/recalcular-precios` | Aplicar margen nuevo a todo el catálogo |
| GET | `/api/reportes/balance?desde=&hasta=` | Utilidad neta = ingresos − costos; + cuentas por cobrar y caja |
| GET | `/api/reportes/series` | Utilidad/caja por mes (gráficas) |
| GET | `/api/reportes/cuentas-por-cobrar` | Ranking de deudores |
| GET | `/api/config/whatsapp` | Estado de la sesión de WhatsApp |
| POST | `/api/config/scrape` | Sincronizar catálogo NICE en segundo plano |

## Apk Android (celular de la esposa)

```bash
cd frontend
npm install
npm run build

# Generar el proyecto Android nativo (una sola vez)
npx cap add android

# Reempaquetar después de cada cambio del frontend
npm run cap:sync

# Abrir con Android Studio y generar la APK (Build → Build APK(s))
npx cap open android
```

En `android/app/src/main/AndroidManifest.xml` agrega estos permisos:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
```

La APK consume las mismas APIs (misma dirección del VPS). En desarrollo usa
`VITE_API_URL=http://IP_DEL_VPS:4000` al compilar; en producción con dominio HTTPS basta
dejarla vacía (mismo origen). En la vista web abierta desde el navegador del celular también
funciona el escáner (requiere HTTPS).

## Proyecto local (Windows/Mac) sin Docker

```bash
# Requisitos: Node 18+ y una instancia de PostgreSQL local o el contenedor de abajo
cd backend
npm install
npm run dev          # API en http://localhost:4000

cd ../frontend
npm install
npm run dev          # web en http://localhost:5173 (proxy hacia el API)
```

## Respaldos

```bash
docker compose exec db pg_dump -U beka_user beka > respaldo_$(date +%F).sql
# Programa un cron en el VPS con ese comando + copia a otro disco/servidor.
```

## Notas de producción

1. **Selectores del portal NICE**: el scraper usa selectores configurables del `.env`
   (`NICE_SEL_FILA`, `NICE_SEL_SKU`, etc.). Revisa el HTML del portal una sola vez y ajusta
   esos valores; el proceso de login + paginación es genérico (tecnología stealth para pasar
   desapercibido).
2. **WhatsApp**: `whatsapp-web.js` es una librería no oficial; evita usarla en cuentas
   críticas o agrega reintentos (la cola de reintentos ya reintenta los comprobantes fallidos
   cada 60 s). Si el navegador Chromium falla en el contenedor, revisa `docker compose logs api`.
3. **Seguridad**: el puerto de PostgreSQL solo escucha en `127.0.0.1` del VPS; el API se
   expone detrás de un reverso proxy con TLS. Las credenciales NICE viven únicamente en `.env`.
4. **Cambiar el margen** recalcula precios al instante desde Configuración (los productos
   ya vendidos conservan su precio histórico en los detalles de venta).
5. **Zona horaria**: el contenedor usa la `TZ` del `.env` (por defecto `America/Mexico_City`).