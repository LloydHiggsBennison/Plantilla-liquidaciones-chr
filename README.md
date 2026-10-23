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

## Configuración y privacidad

La versión pública de GitHub contiene código y datos ficticios. No contiene la nómina real, los sueldos personales, los datos previsionales, el PDF original ni el enlace a la planilla privada. La versión privada conserva la configuración real.

Los archivos locales `dist/workers.js` y `dist/pension-data.js` están excluidos del repositorio público. Sus estructuras están documentadas mediante `dist/workers.example.js` y `dist/pension-data.example.js`. Las reglas generales y los parámetros mensuales están en `dist/payroll-rules.js`.

Los datos y borradores se guardan solo en el navegador. No se sincronizan entre equipos. Se puede exportar una copia JSON. La aplicación no ejecuta transferencias ni emite boletas ante el SII.

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

Importa este repositorio desde GitHub en Vercel y utiliza la rama `main`.

- Framework Preset: **Other**.
- Root Directory: raíz del repositorio (`./`).
- Install Command: `npm ci`.
- Build Command: `npm run prepare:static`.
- Output Directory: `dist`.

El archivo `vercel.json` define estos valores. No se requieren variables de entorno para la versión de ejemplo. La instalación genera los archivos de perfiles ficticios y copia jsPDF; el build actualiza las versiones de los recursos. Presiona **Deploy** para publicar.

El despliegue desde este repositorio público utiliza datos ficticios. La configuración real de trabajadores y previsión está excluida; no se transfiere desde el sitio privado al conectar GitHub con Vercel.
