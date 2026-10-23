# Nómina Simple

Aplicación estática para calcular liquidaciones de sueldo a partir de un selector de trabajador, días de asistencia, ausencias sin goce y anticipos. Exporta el detalle y el total a transferir en PDF A4.

## Ejecutar localmente

Requiere Node.js 20 o posterior. Instala las dependencias y comprueba las pruebas:

```sh
npm ci
npm test
```

Carga las seis variables privadas de autenticación y cifrado en el entorno del proceso. Para guardar localmente configura también `DRAFTS_LOCAL_FILE` con una ruta de trabajo. Después ejecuta:

```sh
npm run build:vercel
npm start
```

Abre http://127.0.0.1:5175. `PORT` permite cambiar el puerto. La página se sirve mediante el servidor autenticado. En Vercel el guardado compartido requiere Neon PostgreSQL y `DATABASE_URL`; el modo de archivo local está deshabilitado en producción.

## Login y privacidad

La versión para Vercel requiere autenticación en el servidor. La sesión no tiene vencimiento por tiempo. Usa una cookie de sesión HttpOnly, SameSite=Strict y Secure en Vercel, combinada con una prueba de acceso guardada en sessionStorage por pestaña. Recargar mantiene el acceso. Una pestaña nueva sin esa prueba muestra el login, aunque otra pestaña tenga sesión. El cierre normal de la pestaña elimina sessionStorage; Cerrar sesión elimina además la cookie. Los borradores se guardan en una base de datos compartida; no dependen de la pestaña. Algunos navegadores restauran sessionStorage al usar Recuperar pestaña cerrada o Restaurar sesión: para cerrar el acceso de forma explícita y fiable, utiliza Cerrar sesión. No se utiliza un temporizador ni se guarda la contraseña en el navegador. Los formularios incluyen protección CSRF y el servidor verifica todas las solicitudes de archivos.

`config/payroll.enc.json` contiene la configuración de los 18 trabajadores cifrada con AES-256-GCM. La clave de descifrado y las credenciales no forman parte del repositorio. El build escribe los datos en `private-dist/`, fuera de la carpeta pública. Una función autenticada entrega los recursos. Los datos y la contraseña nunca deben copiarse a `public/` ni a variables públicas.

Los borradores se sincronizan entre los dos perfiles mediante PostgreSQL (Neon). La aplicación registra transferencias declaradas por el comité; no ejecuta transferencias bancarias ni emite boletas ante el SII.

## Cálculo

- Con una o más ausencias sin goce, el bono de asistencia se elimina completo.
- El sueldo mensual y los bonos imponibles fijos se ajustan proporcionalmente, con divisor 30.
- La colación y movilización mensuales se rebajan por ausencia con divisor 30, redondeando cada asignación al peso. Las tarifas diarias se multiplican por la asistencia efectiva.
- Se recalculan AFP, salud, cesantía, APV e impuesto único según el perfil y el período.
- Se restan los anticipos al final. Los descuentos de ausencias ya están aplicados en los haberes y no se vuelven a restar.
- Las exenciones y los casos a honorarios se configuran por persona.
- En honorarios sin retención del receptor, el PPM del prestador es informativo y no reduce la transferencia.

Solo se cargaron parámetros oficiales contrastados para septiembre y octubre de 2026. Los períodos sin parámetros no muestran un total final. Actualizar las tablas mensuales y los datos personales cuando cambien. No se incluyen horas extras ni reemplazos no registrados.

Ver [reglas, redondeos y fuentes oficiales](docs/calculo.md). Las pruebas incluyen inasistencias, eliminación de bonos, pagos diarios, exenciones, APV, tramos de impuesto, topes, anticipos y honorarios.

## Desplegar en Vercel

Importa el repositorio usando Framework **Other** y la raíz `./`. El archivo `vercel.json` define `npm ci`, `npm run build:vercel` y salida `public`. El directorio público no contiene la nómina; `api/gateway.js` sirve los archivos privados después de validar la sesión.

Antes de desplegar, configura estas variables en Settings → Environment Variables, para Production:

- `AUTH_USERNAME`: nombre del administrador.
- `AUTH_PASSWORD_HASH`: hash scrypt del password del administrador, con formato `scrypt$saltHex$hashHex`.
- `AUTH_COMMITTEE_USERNAME`: usuario del comité.
- `AUTH_COMMITTEE_PASSWORD_HASH`: hash scrypt de la contraseña del comité.
- `DATABASE_URL`: conexión privada de Neon PostgreSQL para el guardado compartido.
- `AUTH_SESSION_SECRET`: secreto aleatorio de al menos 32 bytes.
- `PAYROLL_DATA_KEY`: clave AES de 32 bytes, en Base64, correspondiente al archivo cifrado.

El propietario dispone de un archivo privado `.env` con los valores configurados. No debe subirse a GitHub. No se usa la contraseña en texto plano como clave de cifrado. Si faltan variables, la aplicación permanece cerrada. Tras configurarlas, ejecuta un nuevo Deploy/Redeploy. Cada entorno necesita sus variables explícitas; no habilitar previews con datos reales sin control de acceso.

Para probar localmente la versión protegida, carga las variables privadas en el proceso y ejecuta `npm run build:vercel` y `npm run start:private` (puerto 5175). `npm start` inicia el servidor privado local; Vercel utiliza la función `api/gateway.js`.

El límite de intentos del código es por instancia. Para un límite global, configura una regla en Vercel Firewall para POST `/login` y `/api/gateway`. El servidor no registra contraseñas, cookies ni datos de remuneraciones.

## Comité de administración y tablero compartido

- Administración crea y actualiza borradores sin transferencia registrada.
- El comité revisa borradores y descarga el PDF con los datos guardados. No modifica asistencia, ausencias, anticipos ni otros importes.
- El comité marca una transferencia realizada mediante confirmación, con una referencia opcional. Se conservan usuario, fecha, monto y un hash de la versión revisada.
- El tablero separa Datos pendientes, Por transferir y Transferidas; muestra el total registrado del período.
- Un borrador marcado como transferido queda bloqueado para edición. No se implementa reversión de marcas.
- La versión del registro se comprueba atómicamente en cada escritura para rechazar cambios simultáneos. Repetir una confirmación no duplica el registro ni altera su referencia.

### Activar el guardado compartido en Vercel

1. Reconecta la cuenta de Vercel si la integración solicita autenticación.
2. Conecta **Neon PostgreSQL** al proyecto desde Vercel Marketplace/Storage. Debe quedar definida `DATABASE_URL` en Production, disponible en ejecución.
3. Carga las seis variables privadas de autenticación/cifrado suministradas al propietario (incluyen las dos del comité). No subas ese archivo al repositorio.
4. Ejecuta Redeploy. La tabla `chr_payroll_drafts` se crea al primer acceso a los borradores. La cuenta de base de datos necesita permiso para crear esa tabla; alternativamente créala previamente con el SQL de `server/draft-store.cjs`.

Sin base de datos, la interfaz muestra un error y no afirma haber guardado o marcado registros. En producción no se utiliza ningún archivo temporal ni localStorage como sustituto de la base compartida.

### Borradores anteriores

Administración puede publicar los borradores que permanezcan en el localStorage del mismo sitio usando **Publicar borradores de este navegador**. Si pertenecen a otra dirección web, descarga allí el respaldo JSON y usa **Importar respaldo** en el tablero nuevo. No se sobrescriben registros existentes. Los importados se recalculan como borradores; las marcas de transferencia del archivo no se importan.

### Pruebas locales

Después de `npm ci`, carga las variables privadas, ejecuta `npm run build:vercel` y configura `DRAFTS_LOCAL_FILE` con una ruta de trabajo local antes de `npm run start:private`. Ambos perfiles acceden al mismo archivo mientras se usa ese servidor local. Este modo se rechaza si `VERCEL` está definido.

`npm test` comprueba permisos, sesiones, cálculos, lectura compartida, borradores incompletos, revisiones concurrentes, confirmaciones repetidas y bloqueo posterior a la transferencia. El adaptador SQL se ejecuta con PostgreSQL embebido (PGlite) en las pruebas; esto no sustituye la verificación de una conexión de Neon real antes de usarlo en producción.
