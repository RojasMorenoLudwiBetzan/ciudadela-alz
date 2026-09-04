# Conectar el sitio a Supabase — pasos

Todo el código ya está escrito. Solo falta crear el proyecto en Supabase,
pegar 2 claves en `config.js` y subir la función de moderación.

---

## 1. Crear el proyecto (gratis)

1. Entra a <https://supabase.com> → **New project**.
2. Apunta la contraseña de la base de datos (no se usa en el sitio, pero la pide).
3. Espera a que termine de aprovisionar (~1 min).

## 2. Crear las tablas y el Storage

1. En el panel de Supabase: **SQL Editor** → **New query**.
2. Copia y pega **todo** el contenido de `supabase/schema.sql`.
3. Pulsa **Run**. Debe terminar sin errores.
   Esto crea la tabla `cartillas`, las reglas de seguridad (RLS), la función
   `dar_like` y el bucket público `evidencia`.

## 3. Rellenar `config.js`

En Supabase: **Project Settings** (engranaje) →

- **Data API** → copia **Project URL** → pégalo en `SUPABASE_URL`.
- **API Keys** → copia la clave **`anon` / `public`** → pégala en `SUPABASE_ANON_KEY`.

> La `anon key` es pública por diseño; puede ir en el sitio estático.
> **Nunca** pongas la `service_role` key en `config.js` ni en el sitio.

## 4. Subir la Edge Function de moderación

Necesitas la CLI de Supabase (una sola vez):

```bash
npm install -g supabase
supabase login
supabase link --project-ref TU_REF_DE_PROYECTO
```

Luego, desde la carpeta del proyecto:

```bash
supabase functions deploy moderate --no-verify-jwt
supabase secrets set ADMIN_KEY="pon-aqui-una-clave-larga-y-secreta"
```

- `--no-verify-jwt` deja que el panel llame a la función sin sesión de usuario;
  la seguridad real la da la comprobación de `x-admin-key`.
- `ADMIN_KEY` es la clave que escribirás al entrar en `admin.html`.

### Alternativa sin CLI (por el panel web)

1. Supabase → **Edge Functions** → **Deploy a new function** → nombre `moderate`.
2. Pega el contenido de `supabase/functions/moderate/index.ts`.
3. En **Edge Functions → Settings** desactiva **Verify JWT** para `moderate`.
4. En **Edge Functions → Secrets** añade `ADMIN_KEY` con tu clave.

## 5. Publicar el sitio

Sube la carpeta a Netlify, Vercel, GitHub Pages, Cloudflare Pages, etc.
`admin.html` quedará accesible pero es inútil sin la `ADMIN_KEY`.

---

## Cómo funciona

- **Visitante envía cartilla** → se sube la evidencia al bucket `evidencia`,
  se inserta una fila con `estado = 'pendiente'`. No se publica.
- **`index.html`** solo pide y muestra las filas con `estado = 'aprobado'`,
  ordenadas por `orden`; el número `ARCHIVO EXT. Nº` se calcula por posición,
  así que al rechazar/eliminar una, el resto se renumera solo.
- **`admin.html`** pide la clave, llama a la función `moderate` y permite
  **Aprobar** / **Rechazar** / **Eliminar definitivamente**.
  - Rechazar = queda guardada con `estado = 'rechazado'` (oculta, pero con registro).
  - Eliminar = borra la fila **y** sus archivos del Storage.
- **Me gusta**: botón en cada cartilla aprobada → función `dar_like` (suma 1 al
  contador ligado al `id`). El navegador recuerda en `localStorage` en qué
  cartillas ya votaste para no repetir.
- **Anti-spam**: campo honeypot `website` oculto + tiempo mínimo de formulario.