# Conectar Google Sheets

La lectura directa se configura una vez. La aplicación no escribe en la planilla: administración pulsa **Actualizar desde Google Sheets**, revisa las diferencias y elige qué borradores actualizar. Los cambios del archivo no se aplican automáticamente a las liquidaciones.

## 1. Crear la cuenta de servicio

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea o selecciona un proyecto, por ejemplo `liquidacioneschr`.
2. En **APIs y servicios → Biblioteca**, busca **Google Sheets API** y pulsa **Habilitar**.
3. En **IAM y administración → Cuentas de servicio**, pulsa **Crear cuenta de servicio**. Puedes llamarla `liquidaciones-lector`.
4. No necesita un rol general de propietario/editor del proyecto. Omite los pasos opcionales de permisos y termina la creación.
5. Abre la cuenta creada → **Claves → Agregar clave → Crear clave nueva → JSON**. Guarda el archivo descargado de forma privada.

Consulta las instrucciones oficiales de [creación de cuentas](https://docs.cloud.google.com/iam/docs/service-accounts-create) y [creación de claves](https://docs.cloud.google.com/iam/docs/keys-create-delete).

## 2. Dar acceso a la planilla

Abre el JSON localmente y copia el valor de `client_email`. En la planilla original pulsa **Compartir**, agrega ese correo y selecciona **Lector**. Si tu cuenta no puede compartir el archivo, el propietario de la planilla debe hacerlo. No es necesario hacer pública la planilla.

La aplicación lee el archivo configurado en `server/attendance.cjs`: las hojas **Turnos**, **Nocheros** y **ASEO**, incluidos colores, notas y observaciones.

## 3. Configurar Vercel

En el proyecto **liquidacioneschr → Settings → Environment Variables**, agrega estas dos variables privadas en **Production**:

| Variable | Valor del archivo JSON |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` |

La clave incluye las líneas `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`. Se aceptan saltos de línea reales o `\n` escapados. No agregues las comillas exteriores del JSON. No uses prefijos públicos como `VITE_` o `NEXT_PUBLIC_`.

Conserva las demás variables de autenticación, cifrado y base de datos. En **Deployments**, ejecuta **Redeploy** para que el despliegue utilice las variables nuevas.

No subas el JSON a GitHub, no lo envíes por chat y no lo copies a la carpeta pública.

## 4. Revisar y aplicar cambios

1. Ingresa como administración y selecciona el mes.
2. Abre **Actualizar desde la planilla → Actualizar desde Google Sheets**.
3. Revisa los cambios de asistencia y el monto anterior/nuevo. **Ver origen** muestra fechas y celdas.
4. Selecciona las personas y pulsa **Aplicar cambios y recalcular**.

Los anticipos ya guardados se conservan. Los registros transferidos están bloqueados; las novedades manuales de Juan Ponce se conservan cuando solo existe su horario habitual de referencia. Las personas sin datos suficientes requieren revisión. Los borradores nuevos no se seleccionan automáticamente y necesitan registrar sus anticipos.

La revisión vence después de 15 minutos; esto no vence la sesión de acceso. Si otro usuario modifica un borrador después de la lectura, la aplicación rechaza su actualización y pide volver a leer la planilla.

Mientras Google no esté conectado, descarga la planilla mediante **Archivo → Descargar → Microsoft Excel (.xlsx)** y usa **Cargar Excel actualizado**. Esta opción permite la misma comparación y aplicación de cambios.

Si Google responde sin permisos, comprueba que habilitaste Sheets API, que el correo compartido coincide exactamente con `client_email`, que la clave corresponde a esa cuenta y que hiciste Redeploy.
