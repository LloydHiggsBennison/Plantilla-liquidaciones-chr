const test=require('node:test'),assert=require('node:assert/strict');
const {analyze,fromXlsx,fromGoogle,excelDate,colorKind}=require('../server/attendance.cjs');
const workers=['Angel Villegas','Luis San Martin','Eduardo de la Prida','Cristian Allendes','Manuel Araya Aparicio','Jose Cortes','Victor Diaz','Sergio Cuello','Gloria Ponce','Juan Vergara','Alexis Bernal','Luis Alcaino','Eduardo Bernal'].map((name,i)=>({id:'w'+i,name,role:'Prueba'}));
const c=(value,color='FFFFFF',ref='A3')=>({value,color,ref});
const turn=(day,cells,observation='')=>({index:day+2,cells:{2:c('2026-10-'+String(day).padStart(2,'0')),...cells,11:c(observation)}});
const run=(rows,other=[])=>analyze([{name:'Turnos',rows},...other],'2026-10',workers);
const person=(r,name)=>r.summaries.find(x=>x.name===name);
test('fechas mensuales, colores y nombres repetidos cuentan fechas únicas',()=>{
 const r=run([turn(3,{5:c('J.CORTÉS'),6:c('J.CORTÉS'),7:c('V.DÍAZ','FFFF00'),8:c('V.DÍAZ','FFFF00')}),{index:40,cells:{2:c('2026-11-01'),5:c('J.CORTÉS')}}]);
 assert.equal(person(r,'Jose Cortes').worked,1);assert.equal(person(r,'Victor Diaz').worked,1);assert.equal(excelDate(46296),'2026-10-01');assert.equal(colorKind('FFFCE5CD'),'vacation');assert.equal(colorKind('FF00FF00'),'unknown');
});
test('PV solo identifica lugar; no agrega horas ni un segundo día a Cristian',()=>{
 const r=run([turn(1,{9:c('C.ALLENDES'),10:c('PV 16-24')})]);const s=person(r,'Cristian Allendes');assert.equal(s.worked,1);assert.equal(s.overtimeHours,0);assert.equal(s.replacementDays,0);
});
test('CORTES y DIAZ se reconocen; sus dos columnas cuentan una fecha sin bloquear la importación',()=>{
 const roster=workers.map(w=>({...w,salaryBasis:w.name==='Jose Cortes'?'day':'month'}));
 const r=analyze([{name:'Turnos',rows:[turn(3,{5:c('CORTES'),6:c('CORTES'),7:c('DIAZ'),8:c('DIAZ')})]}],'2026-10',roster);
 assert.equal(person(r,'Jose Cortes').worked,1);assert.equal(person(r,'Jose Cortes').issues.length,0);assert.equal(person(r,'Victor Diaz').worked,1);
});
test('Juan Ponce usa lunes a viernes como referencia sin duplicar registros explícitos',()=>{
 const roster=[...workers,{id:'maintenance',name:'Juan Ponce',role:'Mantención',salaryBasis:'month'}];
 const r=analyze([{name:'Turnos',rows:[turn(1,{5:c('CORTES')})]}],'2026-10',roster),juan=person(r,'Juan Ponce');
 assert.equal(juan.worked,22);assert(juan.scheduleReference);assert(juan.events.every(e=>![0,6].includes(new Date(e.date+'T00:00:00Z').getUTCDay())));
 const explicit=analyze([{name:'Turnos',rows:[turn(1,{5:c('Juan Ponce','FF0000')})]}],'2026-10',roster);assert.equal(person(explicit,'Juan Ponce').absent,1);assert.equal(person(explicit,'Juan Ponce').worked,0);
 const empty=analyze([],'2026-10',roster);assert.equal(person(empty,'Juan Ponce').worked,0);
});
test('un reemplazante externo que cubre solo recibe un día completo',()=>{
 const r=run([turn(8,{6:c('A.VILLEGAS','FF0000'),7:c('M.ARAYA A.')},'M.ARAYA A. POR A.VILLEGAS')]);assert.equal(person(r,'Angel Villegas').absent,1);assert.equal(person(r,'Manuel Araya Aparicio').replacementDays,1);assert.equal(person(r,'Manuel Araya Aparicio').overtimeHours,0);
});
test('una ausencia del grupo reparte cuatro horas a cada uno de los dos presentes',()=>{
 const r=run([turn(8,{6:c('A.VILLEGAS'),8:c('L.SAN MARTIN','FF0000'),9:c('E.DE LA PRIDA')})]);assert.equal(person(r,'Angel Villegas').overtimeHours,4);assert.equal(person(r,'Eduardo de la Prida').overtimeHours,4);assert.equal(person(r,'Luis San Martin').overtimeHours,0);
});
test('si faltan dos del grupo, el tercero recibe un solo día adicional',()=>{
 const r=run([turn(8,{6:c('A.VILLEGAS'),8:c('L.SAN MARTIN','FF0000'),9:c('E.DE LA PRIDA','FF0000')})]);assert.equal(person(r,'Angel Villegas').replacementDays,1);assert.equal(person(r,'Angel Villegas').overtimeHours,0);
});
test('dos ausencias cubiertas por una persona generan un día y no ocho horas',()=>{
 const r=run([turn(8,{6:c('A.VILLEGAS','FF0000'),8:c('L.SAN MARTIN','FF0000'),7:c('M.ARAYA A.')},'M.ARAYA A. POR A.VILLEGAS / M.ARAYA A. POR L.SAN MARTIN')]);const s=person(r,'Manuel Araya Aparicio');assert.equal(s.replacementDays,1);assert.equal(s.overtimeHours,0);
});
test('16 de octubre: Manuel recibe un día adicional y Cristian ninguno',()=>{
 const r=run([turn(16,{6:c('A.VILLEGAS','FF0000'),8:c('L.SAN MARTIN','FF0000'),7:c('M.ARAYA A.'),9:c('C.ALLENDES'),10:c('PV 16-24')},'C.ALLENDES POR A.VILLEGAS / M.ARAYA A. POR L.SAN MARTIN')]);const m=person(r,'Manuel Araya Aparicio'),a=person(r,'Cristian Allendes');assert.equal(m.replacementDays,1);assert.equal(m.overtimeHours,0);assert.equal(a.replacementDays,0);assert.equal(a.overtimeHours,0);
});
test('observación repetida en Turnos y Nocheros no duplica el reemplazo',()=>{
 const r=run([turn(6,{8:c('L.SAN MARTIN')},'San Martin por Alexis Bernal')],[{name:'Nocheros',rows:[{index:8,cells:{2:c('2026-10-06'),4:c('A.BERNAL','FF0000'),7:c('San Martin por Bernal')}}]}]);assert.equal(person(r,'Luis San Martin').replacementDays,1);assert.equal(person(r,'Alexis Bernal').absent,1);
});
test('ASEO requiere dos nombres: Sergio ausente no genera reemplazo; Gloria por Juan sí',()=>{
 const r=run([],[{name:'ASEO',rows:[{index:2,cells:{5:c('J.VERGARA'),6:c('S.CUELLO'),8:c('G.PONCE')}},{index:3,cells:{1:c('2026-10-22'),6:c('Completo','FF0000'),10:c('S.CUELLO DOCTOR MAMA')}},{index:4,cells:{1:c('2026-10-05'),5:c('VAC','F9CB9C'),8:c('DEF'),10:c('Juan vacaciones / Gloria')}}]}]);assert.equal(person(r,'Sergio Cuello').absent,1);assert.equal(person(r,'Sergio Cuello').replacementDays,0);assert.equal(person(r,'Gloria Ponce').replacementDays,1);assert.equal(person(r,'Juan Vergara').vacation,1);
});
test('Luis suma domingos ASEO con recargo y el lunes como adicional normal sin alterar Nocheros',()=>{
 const r=run([],[{name:'Nocheros',rows:[{index:3,cells:{2:c('2026-10-11'),4:c('L.ALCAÍNO')}}]},{name:'ASEO',rows:[{index:2,cells:{7:c('L.ALCAÍNO')}},{index:3,cells:{1:c('2026-10-11'),7:c('ABCDEFGHI','FFFF00')}},{index:4,cells:{1:c('2026-10-12'),7:c('DEF','FFFF00')}},{index:5,cells:{1:c('2026-10-25'),7:c('ABCDEFGHI')}}]}]);const l=person(r,'Luis Alcaino');assert.equal(l.worked,1);assert.equal(l.aseoExtraDays,2);assert.equal(l.replacementDays,1);assert.equal(l.overtimeHours,0);assert.equal(l.issues.length,0);assert(!r.issues.some(x=>x.message.includes('L.ALCAÍNO')));
});

test('Luis el 14 de octubre cubre ambas porterías por 4 horas; conserva 3 jornadas extra de ASEO aparte',()=>{
 const r=run([],[{name:'Nocheros',rows:[{index:3,cells:{2:c('2026-10-14'),4:c('A.BERNAL','FF0000'),5:c('L.ALCAINO'),7:c('L. ALCAINO CUBRE AMBAS')}}]},{name:'ASEO',rows:[{index:2,cells:{7:c('L.ALCAINO')}},...[11,12,25].map((day,i)=>({index:i+3,cells:{1:c('2026-10-'+day),7:c('ABC','FFFF00')}}))]}]);
 const l=person(r,'Luis Alcaino');assert.equal(l.worked,1);assert.equal(l.replacementDays,1);assert.equal(l.aseoExtraDays,2);assert.equal(l.overtimeHours,4);assert.equal(l.issues.length,0);assert.equal(l.events.filter(e=>e.credit==='overtimeHours').length,1);
 const {calculate}=require('../dist/calculator.js'),rules=require('../dist/payroll-rules.js');const w={id:l.worker,base:600000,salaryBasis:'month',employmentType:'employee',allowances:[]};const result=calculate({...l,period:'2026-10',advance:0},w,{rules,pensionData:{[w.id]:{afpRate:.1,healthRate:.07,afcRate:.006}}});assert.equal(result.extraDays,3);assert.equal(result.replacementPay,20000);assert.equal(result.aseoExtraPay,60000);assert.equal(result.overtimePay,10000);
 const withoutNote=run([],[{name:'Nocheros',rows:[{index:3,cells:{2:c('2026-10-14'),5:c('L.ALCAINO')}}]}]);assert.equal(person(withoutNote,'Luis Alcaino').overtimeHours,0);
});

test('el recargo dominical corresponde a cualquier persona asignada en ASEO, no a otros turnos',()=>{
 const r=run([turn(11,{5:c('J.CORTES')})],[{name:'ASEO',rows:[{index:2,cells:{5:c('J.VERGARA'),6:c('S.CUELLO'),7:c('L.ALCAÍNO')}},{index:3,cells:{1:c('2026-10-11'),5:c('ABCDEFGHI','FFFF00'),6:c('ABC','FF0000'),7:c('VAC','F9CB9C')}},{index:4,cells:{1:c('2026-10-18'),5:c('VAC','F9CB9C')}}]}]);assert.equal(person(r,'Juan Vergara').aseoExtraDays,1);assert.equal(person(r,'Juan Vergara').worked,0);assert.equal(person(r,'Juan Vergara').vacation,1);assert.equal(person(r,'Sergio Cuello').aseoExtraDays,0);assert.equal(person(r,'Sergio Cuello').absent,1);assert.equal(person(r,'Luis Alcaino').vacation,0);assert.equal(person(r,'Luis Alcaino').aseoExtraDays,0);assert.equal(person(r,'Jose Cortes').worked,1);assert.equal(person(r,'Jose Cortes').aseoExtraDays,0);
});

test('ASEO no duplica jornada dominical al haber observación de reemplazo',()=>{
 const r=run([],[{name:'ASEO',rows:[{index:2,cells:{5:c('J.VERGARA'),8:c('G.PONCE')}},{index:3,cells:{1:c('2026-10-11'),5:c('VAC','F9CB9C'),8:c('DEF','FFFF00'),10:c('Juan vacaciones / Gloria')}},{index:4,cells:{1:c('2026-10-11'),8:c('DEF','FFFF00')}}]}]);assert.equal(person(r,'Gloria Ponce').aseoExtraDays,1);assert.equal(person(r,'Gloria Ponce').replacementDays,0);
});

test('24 de octubre: color de vacaciones de Juan y una nota de lugar no generan reemplazo ni aviso',()=>{
 const r=run([],[{name:'ASEO',rows:[{index:2,cells:{5:c('J.VERGARA'),6:c('S.CUELLO')}},{index:87,cells:{1:c('2026-10-24'),5:c('DEF','F9CB9C'),6:c('DEF'),10:c('CUELLO CUBRE DEF')}}]}]);assert.equal(person(r,'Juan Vergara').vacation,1);assert.equal(person(r,'Sergio Cuello').worked,1);assert.equal(person(r,'Sergio Cuello').replacementDays,0);assert(!r.issues.some(x=>x.date==='2026-10-24'));
});
test('L. Retamales está excluido aunque su columna histórica tenga asignaciones',()=>{
 const r=run([],[{name:'ASEO',rows:[{index:2,cells:{9:c('L.RETAMALES'),6:c('S.CUELLO')}},{index:3,cells:{1:c('2026-10-25'),9:c('ABCDEFGHI','FF0000'),6:c('ABC')}}]}]);
 assert.equal(person(r,'Sergio Cuello').aseoExtraDays,1);assert(!r.issues.some(x=>x.message.includes('RETAMALES')));assert(!r.summaries.some(x=>x.name.includes('Retamales')));
});
test('lector XLSX conserva fechas, colores y columnas originales',async()=>{
 const ExcelJS=require('exceljs'),wb=new ExcelJS.Workbook(),s=wb.addWorksheet('Turnos');s.getCell('B3').value=new Date('2026-10-16T00:00:00Z');s.getCell('F3').value='A.VILLEGAS';s.getCell('F3').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFF0000'}};
 const sheets=await fromXlsx(Buffer.from(await wb.xlsx.writeBuffer()));const r=analyze(sheets,'2026-10',workers);const a=person(r,'Angel Villegas');assert.equal(a.absent,1);assert.equal(a.events[0].cell,'F3');
});
test('sin conexión de Google no se inventa una lectura vacía',async()=>{await assert.rejects(()=>fromGoogle({}),e=>e.status===503);});
test('los adicionales se valorizan por día y medio día y entran al imponible',()=>{
 const {calculate}=require('../dist/calculator.js'),rules=require('../dist/payroll-rules.js');
 const w={id:'demo',base:600000,salaryBasis:'month',employmentType:'employee',allowances:[]};
 const r=calculate({period:'2026-10',worked:20,absent:0,advance:0,replacementDays:1,overtimeHours:4},w,{rules,pensionData:{demo:{afpRate:.1,healthRate:.07,afcRate:.006}}});
 assert.equal(r.ready,true);assert.equal(r.replacementPay,20000);assert.equal(r.overtimePay,10000);assert.equal(r.totalTaxable,630000);assert(r.pensionTotal>0);
});

test('jornada extra ASEO paga día más 50%, sin inflar horas, y recalcula cotizaciones',()=>{
 const {calculate}=require('../dist/calculator.js'),rules=require('../dist/payroll-rules.js');const w={id:'demo',base:600000,salaryBasis:'month',employmentType:'employee',allowances:[]},context={rules,pensionData:{demo:{afpRate:.1,healthRate:.07,afcRate:.006}}};
 const input={period:'2026-10',worked:20,absent:0,advance:40000,aseoExtraDays:2,replacementDays:1},r=calculate(input,w,context);assert.equal(r.ready,true);assert.equal(r.aseoExtraPay,60000);assert.equal(r.replacementPay,20000);assert.equal(r.overtimeHours,0);assert.equal(r.totalTaxable,680000);assert(r.pensionTotal>calculate({...input,aseoExtraDays:0},w,context).pensionTotal);assert.equal(r.advance,40000);
 assert(calculate({...input,aseoExtraDays:.5},w,context).errors.length);assert(calculate({...input,aseoExtraDays:-1},w,context).errors.length);assert(calculate({...input,aseoExtraDays:32},w,context).errors.length);
});
