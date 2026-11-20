# Envío individual de pre nóminas

El remitente es **requerimientoshr@gmail.com**, confirmado por el propietario. Se usa SMTP de Gmail con TLS en el puerto 465. No se utiliza el correo conectado al chat ni se solicita la contraseña habitual de Google.

## Configurar Gmail y Vercel

1. Accede a la cuenta remitente y activa la verificación en dos pasos.
2. En https://myaccount.google.com/apppasswords crea una contraseña de aplicación para este proyecto.
3. En Vercel, proyecto **liquidacioneschr**, entra a **Settings → Environment Variables**. Agrega **GMAIL_APP_PASSWORD**, de tipo sensible, solo para **Production**, con la contraseña de aplicación de 16 caracteres. Los espacios de presentación se eliminan automáticamente.
4. Haz un **Redeploy**. No uses prefijos públicos, no subas la contraseña a GitHub y no la pegues en el chat.

Google puede no ofrecer contraseñas de aplicación para ciertas configuraciones de cuenta. En ese caso hay que conectar Gmail mediante OAuth antes de habilitar el envío; no desactivar protecciones de la cuenta.

Referencia: https://support.google.com/accounts/answer/185833?hl=es

## Registrar destinatarios

El propietario entregará la lista **nombre → correo**. Se añadirá el campo `email` a cada trabajador correspondiente dentro de la configuración cifrada `config/payroll.enc.json`. No se deducen correos de nombres ni se reutiliza la dirección de otro trabajador. El listado de correos no se publica en archivos de ejemplo.

Las personas sin correo, con una dirección inválida, con un correo repetido o que usan el propio remitente quedan excluidas. Los alias de Gmail equivalentes por puntos, mayúsculas, dominio googlemail.com o sufijo + también se consideran una misma cuenta para detectar destinatarios compartidos.

## Preparar y enviar

1. Guarda los borradores del período y completa sus cálculos.
2. En **Transferencias**, selecciona el mes y pulsa **Enviar pre nóminas**. También existe **Enviar esta pre nómina** debajo del PDF individual.
3. Revisa nombre, dirección, versión del borrador y PDF. Marca únicamente los destinatarios que correspondan; puedes seleccionar todos los habilitados.
4. Confirma las correspondencias y pulsa **Enviar correos individuales**.

Cada petición procesa una sola persona. El servidor obtiene su correo de la configuración y genera el PDF desde el borrador guardado de esa misma persona. No acepta direcciones, adjuntos ni datos de remuneraciones proporcionados por el navegador. No se agregan CC, CCO ni copias al remitente. El PDF de correo lleva el título **PRE NÓMINA INFORMATIVA**, el período y un aviso en cada página indicando que es provisional y no constituye la liquidación oficial.

El comité no dispone de acceso a los endpoints de envío. Las previsualizaciones quedan vinculadas al administrador y vencen a los 15 minutos; esto no cambia la duración de la sesión. Si cambia el borrador o el destinatario, se exige una nueva revisión.

## Registro y duplicados

Los estados se guardan en una tabla separada **chr_payroll_mail**, creada automáticamente con el mismo acceso a PostgreSQL del proyecto. La reserva de cada envío usa control de versiones en la base de datos para impedir el envío simultáneo del mismo documento a la misma cuenta. Las marcas de transferencia no cambian.

Una versión ya enviada no se vuelve a enviar. Una versión con cambios reales o un destinatario corregido requiere revisión y constituye un nuevo envío. Los errores confirmados previos a la entrega a Gmail permiten un reintento explícito.

SMTP no ofrece una transacción atómica entre Gmail y PostgreSQL. Si se pierde la conexión después de iniciar el envío o falla el registro posterior, el resultado queda **sin confirmar** y se bloquea el reintento automático. Administración debe comprobar **Enviados** en Gmail antes de resolver el caso. Un estado **Enviado** acredita aceptación por Gmail, no lectura ni entrega final al buzón; una devolución posterior se revisa en la cuenta remitente.

Las pruebas automatizadas usan un transporte de prueba sin conexión a Gmail y verifican 18 mensajes independientes, destinatarios, PDFs, permisos, cambios de versión, concurrencia y resultados inciertos. Las pruebas no envían correos reales.
