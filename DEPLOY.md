# Despliegue en Railway

La configuración actual está preparada para un único servicio Railway: Express sirve frontend/dist y expone la API en /api. El repositorio local contiene dos repositorios Git independientes, por lo que antes de conectar Railway hay que consolidarlos en un repositorio monorepo con esta estructura:

    /
      backend/
      frontend/
      railway.json
      package.json

En Railway:

1. Crear un proyecto y agregar un servicio PostgreSQL.
2. Conectar el servicio de aplicación al repositorio monorepo y dejar la raíz del servicio en /.
3. Railway tomará railway.json: instala ambos paquetes, compila Vite, inicia Express y espera /api/health.
4. Agregar las variables:
   - NODE_ENV=production
   - DATABASE_URL=\${{Postgres.DATABASE_URL}}
   - ADMIN_PASSWORD_HASH generado con npm run hash-password -- "tu-clave" desde backend/
   - AUTH_SECRET como una cadena aleatoria larga
5. Generar un dominio público para el servicio de aplicación.
6. Verificar GET https://<dominio>/api/health, GET https://<dominio>/api/reservas y GET https://<dominio>/.

No configurar VITE_ACCESS_PW: las variables VITE_* quedan visibles en el bundle del navegador. VITE_API_URL debe quedar vacío en producción porque frontend y API comparten origen.

Para probar localmente, ejecutar PostgreSQL y luego:

    copy backend\.env.example backend\.env
    cd backend
    npm install
    npm run hash-password -- "tu-clave"

Completar backend/.env, compilar el frontend con npm run build --prefix frontend y arrancar con npm start --prefix backend.
