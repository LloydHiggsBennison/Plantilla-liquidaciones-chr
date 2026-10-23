# Nómina Simple

Aplicación estática para calcular liquidaciones de sueldo a partir de un selector de trabajador, días de asistencia, ausencias sin goce y anticipos. Exporta el detalle y el total a transferir en PDF A4.

## Ejecutar

Requiere Node.js 20 o posterior.

```sh
npm ci
npm start
```

Abrir http://127.0.0.1:5173. La instalación prepara jsPDF y, si no hay configuración local, copia los dos perfiles ficticios de ejemplo. Nunca se sobrescriben configuraciones existentes.

```sh
npm test
npm run prepare:static
```

El segundo comando prepara `dist/` para un servidor estático. No se necesita un backend para los cálculos. Para cambiar el puerto se utiliza la variable de entorno `PORT`.

## Login y privacidad

La versión para Vercel requiere autenticación en el servidor. La sesión no tiene vencimiento por tiempo. Usa una cookie de sesión HttpOnly, SameSite=Strict y Secure en Vercel, combinada con una prueba de acceso guardada en sessionStorage por pestaña. Recargar mantiene el acceso. Una pestaña nueva sin esa prueba muestra el login, aunque otra pestaña tenga sesión. El cierre normal de la pestaña elimina sessionStorage; Cerrar sesión elimina además la cookie. Los borradores permanecen en localStorage. Algunos navegadores restauran sessionStorage al usar Recuperar pestaña cerrada o Restaurar sesión: para cerrar el acceso de forma explícita y fiable, utiliza Cerrar sesión. No se utiliza un temporizador ni se guarda la contraseña en el navegador. Los formularios incluyen protección CSRF y el servidor verifica todas las solicitudes de archivos.

`config/payroll.enc.json` contiene la configuración de los 18 trabajadores cifrada con AES-256-GCM. La clave de descifrado y las credenciales no forman parte del repositorio. El build escribe los datos en `private-dist/`, fuera de la carpeta pública. Una función autenticada entrega los recursos. Los datos y la contraseña nunca deben copiarse a `public/` ni a variables públicas.

Los borradores se guardan en el navegador y no se sincronizan entre equipos. La aplicación no ejecuta transferencias ni emite boletas ante el SII.

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

Antes de desplegar, configura estas cuatro variables en Settings → Environment Variables, para Production:

- `AUTH_USERNAME`: nombre del administrador.
- `AUTH_PASSWORD_HASH`: hash scrypt del password, con formato `scrypt$saltHex$hashHex`.
- `AUTH_SESSION_SECRET`: secreto aleatorio de al menos 32 bytes.
- `PAYROLL_DATA_KEY`: clave AES de 32 bytes, en Base64, correspondiente al archivo cifrado.

El propietario dispone de un archivo privado `.env` con los valores configurados. No debe subirse a GitHub. No se usa la contraseña en texto plano como clave de cifrado. Si faltan variables, la aplicación permanece cerrada. Tras configurarlas, ejecuta un nuevo Deploy/Redeploy. Cada entorno necesita sus variables explícitas; no habilitar previews con datos reales sin control de acceso.

Para probar localmente la versión protegida, carga las variables privadas en el proceso y ejecuta `npm run build:vercel` y `npm run start:private` (puerto 5175). El comando `npm start` corresponde al servidor estático de demostración, sin autenticación, y no se utiliza en Vercel.

El límite de intentos del código es por instancia. Para un límite global, configura una regla en Vercel Firewall para POST `/login` y `/api/gateway`. El servidor no registra contraseñas, cookies ni datos de remuneraciones.
