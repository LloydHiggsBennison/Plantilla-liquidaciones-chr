# Cálculo de liquidaciones

Las reglas de negocio siguientes fueron confirmadas por el usuario el 23 de octubre de 2026:

- El bono de asistencia se prorratea con base de 30 días: monto mensual × máx(0, 30 − ausencias) ÷ 30, redondeado al peso. Una ausencia deja 29/30 del bono; no se elimina completo.
- El descuento del sueldo mensual se calcula sobre el sueldo base dividido por 30 y multiplicado por los días de ausencia. Se redondea el descuento total al peso y se resta de la base. Los días de asistencia efectiva no descuentan los descansos pagados.
- Los bonos imponibles mensuales fijos, incluido el reajuste, se prorratean según `(30 - ausencias) / 30`, con mínimo cero.
- Colación y movilización mensuales se rebajan proporcionalmente por ausencias: monto mensual × máx(0, 30 − ausencias) ÷ 30, redondeado al peso por asignación.
- Para pagos diarios se multiplica la tarifa por los días efectivamente trabajados. La ausencia no se descuenta otra vez. Las asignaciones diarias se multiplican por esos mismos días.
- Las cotizaciones se recalculan sobre el nuevo imponible. Los porcentajes se configuran por persona; un descuento cero documentado se conserva como cero y no se infiere la causa.
- Los anticipos se restan al final, después de cotizaciones e impuesto. Si superan el disponible, no se presenta un total negativo como transferencia válida.
- No se importan automáticamente horas extras, reemplazos ni anticipos del mes de referencia.

## Cotizaciones e impuesto

AFP: tasa del trabajador (ahorro más comisión). Salud: tasa configurada. Cesantía: tasa del trabajador que corresponda al perfil. Cada descuento se redondea al peso por concepto. Los aportes a cargo del empleador no se descuentan de la transferencia del trabajador.

Se aplican los topes previsionales y los parámetros del período configurado. La renta tributable se calcula restando del imponible las cotizaciones del trabajador y el APV con beneficio tributario cuando corresponda. El impuesto único usa la tabla mensual del período. Para regímenes de APV sin especificar, si ambos tratamientos producen impuestos distintos se bloquea el total hasta completar el dato.

Solo se cargaron parámetros contrastados para septiembre y octubre de 2026. Los meses que no tienen parámetros no muestran un total final. Las tasas personales también deben actualizarse cuando cambie la afiliación o situación del trabajador.

## Honorarios

Se procesan separadamente de las remuneraciones dependientes. El perfil determina si el importe es bruto y si el receptor retiene. En honorarios sin retención del receptor, la transferencia es el bruto devengado menos anticipos; el PPM del prestador se informa pero no se descuenta de la transferencia. No se emite ninguna boleta ante el SII ni se ejecutan pagos desde esta aplicación.

## Fuentes oficiales consultadas

- [DT: descuento de inasistencias en remuneraciones mensuales](https://www.dt.gob.cl/legislacion/1624/w3-propertyvalue-156720.html).
- [SP: comisiones de AFP](https://www.spensiones.cl/portal/institucional/594/w3-propertyvalue-9893.html).
- [AFC: aportes y cobertura](https://www.afc.cl/mi-seguro-de-cesantia/que-es-el-seguro/).
- [SP: topes definitivos para 2026](https://www71.spensiones.cl/portal/institucional/594/articles-16921_recurso_1.pdf).
- [SII: impuesto único de 2026](https://www.sii.cl/valores_y_fechas/impuesto_2da_categoria/impuesto2026.htm).
- [SII: UF 2026](https://www.sii.cl/valores_y_fechas/uf/uf2026.htm).
- [SII: tasa de honorarios de 2026](https://www.sii.cl/preguntas_frecuentes/declaracion_renta/001_140_8398.htm).
- [SII: honorarios prestados a comunidades habitacionales](https://www.sii.cl/pagina/jurisprudencia/adminis/2015/renta/ja1977.htm).
