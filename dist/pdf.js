(function(root){
 root.buildSummaryPdf=function(jsPDF,w,d,r){
  const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n),isHonorarios=r.kind==='honorarios';
  const pdf=new jsPDF({unit:'mm',format:'a4'});let y=60;
  function reserve(h){if(y+h>272){pdf.addPage();y=22;}}
  function text(s,size=8){pdf.setFontSize(size);for(const l of pdf.splitTextToSize(s,174)){reserve(5);pdf.text(l,18,y);y+=4.5;}y+=3;}
  function line(label,value,bold=false){pdf.setFontSize(9);const ls=pdf.splitTextToSize(label,117);reserve(Math.max(6,ls.length*4.5));pdf.setFont('helvetica',bold?'bold':'normal');pdf.text(ls,18,y);pdf.text(String(value),192,y,{align:'right'});y+=Math.max(6,ls.length*4.5);}
  function section(label){reserve(15);y+=3;pdf.setDrawColor(215,225,218);pdf.line(18,y-4,192,y-4);pdf.setFont('helvetica','bold');text(label,9);pdf.setFont('helvetica','normal');}
  pdf.setFillColor(20,98,79);pdf.rect(0,0,210,8,'F');pdf.setTextColor(20,98,79);pdf.setFont('helvetica','bold');pdf.setFontSize(21);pdf.text(isHonorarios?'Resumen de honorarios':'Liquidación de sueldo',18,25);pdf.setTextColor(40,55,48);pdf.setFontSize(10);pdf.text('Período: '+d.period,18,35);pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text('Condominio Horizonte de Reñaca',18,43);pdf.text(r.ready?'CÁLCULO COMPLETO':'BORRADOR - DATOS PENDIENTES',18,51);
  line('Trabajador',w.name);line('Cargo',w.role);if(r.vacation)line('Días de vacaciones pagadas',r.vacation);if(r.replacementDays)line('Días adicionales sin recargo',r.replacementDays);if(r.overtimeHours)line('Horas extras / cobertura',r.overtimeHours);if(r.aseoExtraDays)line('Jornadas extra ASEO con 50%',r.aseoExtraDays);line('Total de días extras',r.extraDays??((r.replacementDays||0)+(r.aseoExtraDays||0)));line('Asistencia / ausencias sin goce',r.worked+' / '+r.absent);
  section(isHonorarios?'HONORARIOS':'HABERES');for(const a of r.incomeRows)line(a.label,money(a.amount));
  if(!isHonorarios){line('Total imponible',money(r.totalTaxable));line('Total no imponible',money(r.nonTaxable));}line('Total haberes',money(r.gross),true);
  if(r.adjustments.length){section('REBAJAS YA APLICADAS EN LOS HABERES');for(const a of r.adjustments)line(a.label,money(a.amount));}
  section('DESCUENTOS');for(const a of r.deductionRows)line(a.label,money(a.amount));line('Total descuentos',money(r.totalDeductions),true);
  section('TOTAL A TRANSFERIR');line(r.ready?'Transferencia CLP':'Falta completar datos',r.ready?money(r.transfer):'PENDIENTE',true);
  pdf.setFont('helvetica','normal');
  if(isHonorarios){for(const n of r.warnings)text(n);if(r.selfPpm)text('PPM informativo del prestador: '+money(r.selfPpm)+'. No se descuenta de esta transferencia.');}
  else{const p=r.insurance;text('AFP: '+(p?.afp||'pendiente')+' · Salud: '+(p?.health||'pendiente')+'. Cotizaciones recalculadas sobre el imponible del período. La rebaja de sueldo y bonos no se resta por segunda vez.');}
  for(const n of r.pending)text('Pendiente: '+n);text('Documento de cálculo. No acredita que se haya efectuado el pago. No incluye horas extras ni reemplazos no registrados.');
  const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setFontSize(7);pdf.setTextColor(110);pdf.text('Condominio Horizonte de Reñaca · '+d.period+' · '+i+' / '+pages,18,285);}return pdf;
 };
})(typeof window==='undefined'?globalThis:window);

