(function(root){
 const fields=['worked','absent','advance'];
 const taxBands=[{limit:13.5,rate:0,rebate:0},{limit:30,rate:0.04,rebate:0.54},{limit:50,rate:0.08,rebate:1.74},{limit:70,rate:0.135,rebate:4.49},{limit:90,rate:0.23,rebate:11.14},{limit:120,rate:0.304,rebate:17.8},{limit:310,rate:0.35,rebate:23.32},{limit:Infinity,rate:0.4,rebate:38.82}];
 const round=Math.round;
 function monthlyTax(base,utm){const band=taxBands.find(b=>base<=b.limit*utm);return Math.max(0,round(base*band.rate-band.rebate*utm));}
 function calculate(d,w,context){
  const rules=context?.rules||root.PayrollRules,insurance=context?.pensionData||root.PensionData;
  const r={errors:[],pending:[],warnings:[],incomeRows:[],deductionRows:[],adjustments:[],ready:false,transfer:null,net:null,gross:0,totalTaxable:0,nonTaxable:0,totalDeductions:0,absenceSalaryDiscount:0,attendanceBonusLoss:0,fixedBonusesDiscount:0,pensionTotal:0,afp:0,health:0,afc:0,apv:0,tax:0,taxBase:0,preAdvanceNet:0};
  for(const key of fields){r[key]=Number(d[key]);if(d[key]===''||d[key]==null||!Number.isFinite(r[key])||r[key]<0)r.errors.push('Completa asistencia, ausencias y anticipos con valores mayores o iguales a cero.');}
  const validPeriod=/^\d{4}-(0[1-9]|1[0-2])$/.test(d.period||'');if(!validPeriod)r.errors.push('Selecciona un período válido.');
  const days=validPeriod?new Date(Number(d.period.slice(0,4)),Number(d.period.slice(5,7)),0).getDate():31;
  if(!Number.isInteger(r.worked)||!Number.isInteger(r.absent))r.errors.push('Los días deben ser números enteros.');
  if(r.worked+r.absent>days)r.errors.push('La asistencia y las ausencias superan los días del mes.');
  if(!Number.isSafeInteger(r.advance))r.errors.push('Los anticipos deben ser un monto entero en pesos.');
  if(r.errors.length)return r;
  if(!w||!rules){r.pending.push('Falta la configuración del trabajador o las reglas de cálculo.');return r;}
  if(r.worked===0&&r.absent===0)r.pending.push('Registra los días de asistencia o de ausencia para calcular el período.');
  r.kind=w.employmentType==='honorarios'?'honorarios':'employee';r.insurance=r.kind==='employee'?insurance?.[w.id]:null;r.rulesVersion=rules.version;
  if(r.kind==='honorarios'){
   const contract=rules.honorarios?.[w.id],rate=rules.honorariosRetentionByYear?.[Number(d.period.slice(0,4))];
   if(contract?.amountType!=='gross'||typeof contract?.receiverWithholds!=='boolean')r.pending.push('Confirma el monto bruto y quién retiene en los honorarios.');
   if(typeof rate!=='number')r.pending.push('Falta la tasa de honorarios del año seleccionado.');
   r.gross=round(w.dailyRate*r.worked);r.incomeRows.push({label:'Honorarios brutos ('+r.worked+' días)',amount:r.gross,note:'Tarifa bruta por día: '+w.dailyRate});
   r.withholding=contract?.receiverWithholds?round(r.gross*(rate||0)):0;r.selfPpm=contract?.receiverWithholds?0:round(r.gross*(rate||0));
   r.deductionRows=[{label:'Retención del receptor',amount:r.withholding},{label:'Anticipos',amount:r.advance}];r.totalDeductions=r.withholding+r.advance;r.preAdvanceNet=r.gross-r.withholding;
   r.warnings.push(contract?.receiverWithholds?'El receptor retiene el impuesto de honorarios.':'Boleta sin retención del receptor: el prestador declara y paga su PPM. El PPM informativo no se descuenta de esta transferencia.');
   if(r.totalDeductions>r.gross)r.errors.push('Los anticipos superan el monto disponible para transferir.');
   if(!r.errors.length&&!r.pending.length){r.transfer=r.gross-r.totalDeductions;r.net=r.transfer;r.ready=true;}return r;
  }
  const params=rules.periods?.[d.period];if(!params)r.pending.push('Faltan los parámetros tributarios y previsionales del período '+d.period+'.');
  r.pending.push(...(w.pending||[]));
  if(!r.insurance)r.pending.push('Faltan los datos previsionales del trabajador.');
  else for(const k of ['afpRate','healthRate','afcRate'])if(typeof r.insurance[k]!=='number'||r.insurance[k]<0||r.insurance[k]>1)r.pending.push('Falta una tasa previsional válida: '+k+'.');
  const fraction=Math.max(0,30-r.absent)/30;
  if(w.salaryBasis==='day')r.baseAfterAbsences=round(w.dailyRate*r.worked);
  else{r.absenceSalaryDiscount=Math.min(w.base,round(w.base*r.absent/30));r.baseAfterAbsences=w.base-r.absenceSalaryDiscount;}
  r.incomeRows.push({label:w.salaryBasis==='day'?'Sueldo base ('+r.worked+' días)':'Sueldo base del período',amount:r.baseAfterAbsences,taxable:true,note:r.absenceSalaryDiscount?'Base mensual menos descuento por ausencias':'Sueldo configurado'});
  if(r.absenceSalaryDiscount)r.adjustments.push({label:'Sueldo: base mensual ÷ 30 × '+r.absent+' día(s)',amount:r.absenceSalaryDiscount});
  for(const a of w.allowances||[]){
   let amount=a.amount,note='';
   if(a.basis==='day'){amount=round(a.amount*r.worked);note='Tarifa diaria × '+r.worked+' días trabajados';}
   else if(a.basis!=='month'){r.pending.push('Falta la regla de pago de '+a.label+'.');continue;}
   else if(a.label==='Bono asistencia'){
    if(r.absent>0){amount=0;r.attendanceBonusLoss+=a.amount;note='No se paga por registrar inasistencia';r.adjustments.push({label:'Bono de asistencia no devengado',amount:a.amount});}
   }else if(a.taxable&&r.absent>0){
    if(rules.fixedBonusAbsencePolicy==='prorate'){const discount=a.amount-round(a.amount*fraction);amount=a.amount-discount;r.fixedBonusesDiscount+=discount;note='Proporcional a los días sin goce';r.adjustments.push({label:a.label+': descuento proporcional',amount:discount});}
    else if(rules.fixedBonusAbsencePolicy!=='fixed')r.pending.push('Falta definir el descuento por ausencia de '+a.label+'.');
   }else if(!a.taxable&&r.absent>0){
    if(rules.nonTaxableAbsencePolicy==='prorate'){amount=round(a.amount*fraction);note='Proporcional a los días sin goce';r.adjustments.push({label:a.label+': descuento proporcional',amount:a.amount-amount});}
    else if(rules.nonTaxableAbsencePolicy==='fixed')note='Se mantiene completa según la regla acordada';
    else r.pending.push('Falta definir el pago de '+a.label+' con inasistencias.');
   }
   r.incomeRows.push({label:a.label,amount,taxable:a.taxable,note});
  }
  r.totalTaxable=r.incomeRows.filter(a=>a.taxable).reduce((s,a)=>s+a.amount,0);r.nonTaxable=r.incomeRows.filter(a=>!a.taxable).reduce((s,a)=>s+a.amount,0);r.gross=r.totalTaxable+r.nonTaxable;
  if(r.insurance&&params){
   const afpBase=Math.min(r.totalTaxable,params.uf*params.afpCapUF),afcBase=Math.min(r.totalTaxable,params.uf*params.afcCapUF);
   r.afp=round(afpBase*(r.insurance.afpRate||0));r.health=round(afpBase*(r.insurance.healthRate||0));r.afc=round(afcBase*(r.insurance.afcRate||0));r.apv=r.insurance.apv||0;r.pensionTotal=r.afp+r.health+r.afc;
   const beforeApv=Math.max(0,r.totalTaxable-r.pensionTotal);r.taxBase=Math.max(0,beforeApv-(r.insurance.apvRegime==='B'?r.apv:0));
   if(r.apv&&!['A','B'].includes(r.insurance.apvRegime)&&monthlyTax(beforeApv,params.utm)!==monthlyTax(Math.max(0,beforeApv-r.apv),params.utm))r.pending.push('Falta confirmar el régimen tributario del APV.');
   r.tax=monthlyTax(r.taxBase,params.utm);
  }
  r.deductionRows=[{label:'AFP · '+(r.insurance?.afp||'pendiente'),amount:r.afp},{label:r.insurance?.health||'Salud',amount:r.health},{label:'Seguro de cesantía',amount:r.afc},{label:'APV',amount:r.apv},{label:'Impuesto único',amount:r.tax},{label:'Anticipos',amount:r.advance}];
  r.totalDeductions=r.deductionRows.reduce((s,a)=>s+a.amount,0);r.preAdvanceNet=r.gross-r.pensionTotal-r.apv-r.tax;
  if(!r.pending.length&&r.totalDeductions>r.gross)r.errors.push('Los anticipos o descuentos superan los haberes disponibles. Revisa los montos.');
  if(!r.errors.length&&!r.pending.length){r.transfer=r.gross-r.totalDeductions;r.net=r.transfer;r.ready=true;}
  return r;
 }
 const api={calculate,fields,monthlyTax};if(typeof module!=='undefined')module.exports=api;else root.Payroll=api;
})(typeof window==='undefined'?globalThis:window);
