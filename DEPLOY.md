# Despliegue en Vercel

El repositorio está preparado como un único proyecto Vercel:

- frontend/ se compila como aplicación Vite estática.
- api/index.js expone el backend Express como una Vercel Function.
- /api/* y la SPA comparten el mismo dominio, por lo que no se necesita CORS.
- PostgreSQL debe ser externo (Neon, Supabase o Vercel Marketplace); Vercel no ofrece almacenamiento persistente para SQLite.

## Configuración

1. Importar Marcos1750/sistema-reservas-cancha en Vercel.
2. Mantener la raíz del proyecto en /.
3. Vercel tomará vercel.json para instalar dependencias, compilar Vite y crear la Function.
4. Definir estas variables en Production, Preview y Development:

   - DATABASE_URL: conexión PostgreSQL.
   - BETTER_AUTH_SECRET: secreto aleatorio largo, de al menos 32 caracteres.
   - BETTER_AUTH_URL: URL pública exacta de la aplicación, por ejemplo `https://sistema-reservas-cancha.vercel.app`.
   - GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET: credenciales OAuth Web de Google.
   - SUPERADMIN_EMAIL: tu correo de Google, que recibirá acceso total al iniciar sesión.
   - BETTER_AUTH_TRUSTED_ORIGINS: opcional; dominios adicionales separados por comas, para previews autorizados.
   - Vercel define el entorno de producción automáticamente; no agregues `NODE_ENV=production` como variable manual porque puede hacer que `npm ci` omita las dependencias de build.

5. No definir VITE_ACCESS_PW ni VITE_API_URL en producción.
6. Verificar GET https://<dominio>/api/health, GET https://<dominio>/api/reservas y GET https://<dominio>/.

## CLI

Desde la raíz del repositorio:

    npm install -g vercel
    vercel login
    vercel link
    vercel env add DATABASE_URL production
    vercel env add BETTER_AUTH_SECRET production
    vercel env add BETTER_AUTH_URL production
    vercel env add GOOGLE_CLIENT_ID production
    vercel env add GOOGLE_CLIENT_SECRET production
    vercel env add SUPERADMIN_EMAIL production
    vercel --prod

Las funciones Vercel son efímeras: las migraciones se ejecutan al inicializar la Function y todos los datos viven en PostgreSQL.

El proyecto Vercel ya está creado como `sistema-reservas-cancha` y publica el frontend en `https://sistema-reservas-cancha.vercel.app`. En Google Cloud Console hay que registrar exactamente `https://sistema-reservas-cancha.vercel.app/api/auth/callback/google` como URI de redirección autorizada. Hasta configurar las variables de entorno, la interfaz carga pero la API devolverá un error 500 porque no puede abrir PostgreSQL o autenticarse.
