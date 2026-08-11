# Despliegue de BEKA en VPS con Coolify

La API corre en un contenedor Docker (Node 20 + Chrome para WhatsApp) y el frontend
compilado lo sirve la propia API en el puerto **4100**. La base de datos es PostgreSQL.

## 1. Subir el proyecto a GitHub

1. Crea un repositorio **privado** en GitHub (ej. `beka`).
2. En la PC (ya hay git inicializado en la carpeta del proyecto):

```bash
git add .
git commit -m "BEKA: backend + frontend + despliegue Docker"
git remote add origin https://github.com/TU_USUARIO/beka.git
git push -u origin main
```

> OJO: NO se sube `backend/data` (sesión de WhatsApp), `frontend/android`, APKs ni
> llaves. Están excluidos en `.gitignore`.

## 2. Conectar GitHub con Coolify

En tu panel de Coolify: **Sources → GitHub App → Connect GitHub App** y autoriza el
repositorio de BEKA. (O deja el repo público y usa deploy webhook.)

## 3. Crear la base de datos PostgreSQL

1. **Databases → New → PostgreSQL**.
2. Nombre: `beka-db`. Anota el `DATABASE_URL` interno que te da Coolify
   (ej. `postgres://beka:xxxx@postgres:5432/beka`) — las apps del mismo proyecto se
   alcanzan por el nombre interno del servicio.

## 4. Crear la aplicación

1. **Projects → tu proyecto → Resources → New Resource → Application**.
2. Elige el repositorio de BEKA. Build Pack: **Dockerfile** (lo detecta solo).
3. Puerto de publicación: `4100` → puerto del host `4100`.
4. Dominios: déjalo vacío por ahora (se usará la IP directa).
5. **Environment Variables** (enlaces de Configuración → Environment Variables):

```bash
PORT=4100
DATABASE_URL=<el que genero Coolify en el paso 3>
AUTH_SECRET=YFwMniela6r8kGoBqV1tK27gmyjNPDCE9zxJvSOQ0UTLhuHf
WHATSAPP_ENABLED=true
WHATSAPP_SESION_DIR=/app/data/whatsapp
FRONTEND_DIST=/app/frontend-dist
CHROME_EXECUTABLE=/usr/bin/google-chrome
NOMBRE_NEGOCIO=BEKA
```

6. **Persistent Storage** (Configuración → Volumes / Persistent Storage):
   monta el volumen en `/app/data` (ahí vive la sesión de WhatsApp; sin esto pedirá QR
   en cada reinicio).

## 5. Desplegar y escanear el QR

1. **Deploy**. Espera a que termine (el build tarda unos minutos: compila frontend,
   instala Chrome y dependencias).
2. Abre `http://IP_DEL_VPS:4100/api/config/whatsapp-qr` en el navegador y escanea el
   QR con el WhatsApp del negocio (solo la primera vez).
3. Revisa en **Logs** que aparezca `[whatsapp] Sesion conectada correctamente`.

## 6. Poner el portal a la IP del VPS

Entra a la terminal de la base de datos en Coolify (o desde la app: **Configuración**)
y ejecuta:

```sql
UPDATE configuracion SET valor = 'http://IP_DEL_VPS:4100' WHERE clave = 'PORTAL_URL';
```

También puedes cambiar la URL del portal desde el panel de Configuración de la app.

## 7. Poner la APK en la IP del VPS

1. En la app del teléfono: botón **Salir** → inicia sesión de nuevo con la dirección
   del servidor `http://IP_DEL_VPS:4100` (o bórrala si quieres que te la pida).
2. Si quieres la APK con la URL fija, edita `frontend/src/api/client.ts` (VITE_API_URL)
   o recompila con `npm run build` + `npx cap sync android` + gradle release, y
   reinstala.

## 8. Opcional: no escanear el QR en el VPS

La sesión local vive en `backend/data/whatsapp` (NO se sube a git). Para llevarla al
VPS y saltarte el QR:

1. Sube la carpeta `whatsapp` a la máquina del VPS (SCP o desde la terminal web).
2. En Coolify, copia el contenido dentro del volumen persistente (`/app/data/whatsapp`),
   con permisos de escritura.
3. Reinicia la aplicación.

## Datos recordatorios

- Admin por defecto: `admin` / `Admin123!` (cámbiala después del primer ingreso).
- La API arranca sola: migraciones de BD, admin y configuración base.
- Logs de WhatsApp: aparecen en **Logs** de Coolify.
- Para HTTPS con dominio más adelante: agrega el dominio en la app de Coolify y activa
  **HTTPS** (Let's Encrypt automático); luego cambia `PORTAL_URL` a la URL https.
