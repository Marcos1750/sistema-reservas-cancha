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
   - AUTH_SECRET: secreto aleatorio largo.
   - ADMIN_PASSWORD_HASH: hash generado con npm run hash-password -- "tu-clave" desde la raíz del repositorio.
   - NODE_ENV=production en Production.

5. No definir VITE_ACCESS_PW ni VITE_API_URL en producción.
6. Verificar GET https://<dominio>/api/health, GET https://<dominio>/api/reservas y GET https://<dominio>/.

## CLI

Desde la raíz del repositorio:

    npm install -g vercel
    vercel login
    vercel link
    vercel env add DATABASE_URL production
    vercel env add AUTH_SECRET production
    vercel env add ADMIN_PASSWORD_HASH production
    vercel --prod

Las funciones Vercel son efímeras: las migraciones se ejecutan al inicializar la Function y todos los datos viven en PostgreSQL.

El proyecto Vercel ya está creado como `sistema-reservas-cancha` y publica el frontend en `https://sistema-reservas-cancha.vercel.app`. Hasta configurar las tres variables de entorno, la interfaz carga pero la API devolverá un error 500 porque no puede abrir PostgreSQL.
