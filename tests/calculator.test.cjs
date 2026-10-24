const test=require('node:test');
const assert=require('node:assert/strict');
const {calculate,monthlyTax}=require('../dist/calculator.js');
const config=require('../dist/payroll-rules.js');
const monthly={id:'monthly-demo',name:'Trabajador de prueba',employmentType:'employee',salaryBasis:'month',base:900000,pending:[],allowances:[
 {label:'Bono nocturno',amount:60000,taxable:true,basis:'month'},
 {label:'Bono asistencia',amount:30000,taxable:true,basis:'month'},
 {label:'Colación',amount:50000,taxable:false,basis:'month'},
 {label:'Movilización',amount:60000,taxable:false,basis:'month'}
]};
const pension={afp:'Habitat',afpRate:0.1127,health:'Fonasa',healthRate:0.07,afcRate:0.006,apv:0};
const data={period:'2026-10',worked:30,absent:0,advance:50000};
function calc(d={},w=monthly,p=pension,rules=config){return calculate({...data,...d},w,{rules,pensionData:{[w.id]:p}});}
test('las vacaciones mensuales mantienen sueldo y bonos completos sin duplicar el pago',()=>{
 const complete=calc({worked:30,vacation:0}),vacation=calc({worked:16,vacation:14}),fullVacation=calc({worked:0,vacation:30});
 for(const r of [vacation,fullVacation]){assert.equal(r.ready,true);assert.equal(r.baseAfterAbsences,monthly.base);assert.equal(r.transfer,complete.transfer);assert.equal(r.absenceSalaryDiscount,0);assert.equal(r.attendanceBonusLoss,0);assert.equal(r.vacationPay,0);assert(r.incomeRows[0].label.includes('vacaciones pagadas'));}
});
test('para pago diario las vacaciones se agregan al sueldo y a la base de cotización',()=>{
 const w={...monthly,salaryBasis:'day',base:null,dailyRate:40000,allowances:[]},r=calc({worked:5,vacation:2,absent:0,advance:0},w);
 assert.equal(r.ready,true);assert.equal(r.vacationPay,80000);assert.equal(r.totalTaxable,280000);assert.equal(r.incomeRows.find(x=>x.label.startsWith('Vacaciones pagadas')).amount,80000);assert.equal(r.afp,31556);
});
test('mes completo: imponible, no imponible y transferencia conciliados',()=>{const r=calc();assert.equal(r.totalTaxable,990000);assert.equal(r.nonTaxable,110000);assert.equal(r.afp,111573);assert.equal(r.health,69300);assert.equal(r.afc,5940);assert.equal(r.tax,0);assert.equal(r.transfer,863187);assert.equal(r.ready,true);assert.equal(r.gross-r.totalDeductions,r.transfer);});
test('una ausencia prorratea sueldo y todos los haberes mensuales y recalcula cotizaciones',()=>{const r=calc({worked:29,absent:1});assert.equal(r.baseAfterAbsences,870000);assert.equal(r.absenceSalaryDiscount,30000);assert.equal(r.attendanceBonusLoss,1000);assert.equal(r.fixedBonusesDiscount,2000);assert.equal(r.totalTaxable,957000);assert.equal(r.nonTaxable,106333);assert.equal(r.adjustments.find(x=>x.label==='Colación: descuento proporcional').amount,1667);assert.equal(r.adjustments.find(x=>x.label==='Movilización: descuento proporcional').amount,2000);assert.equal(r.afp,107854);assert.equal(r.health,66990);assert.equal(r.afc,5742);assert.equal(r.transfer,832747);assert.equal(r.gross-r.totalDeductions,r.transfer);});
test('dos ausencias no descuentan el bono de asistencia dos veces',()=>{const r=calc({worked:28,absent:2});assert.equal(r.attendanceBonusLoss,2000);assert.equal(r.incomeRows.find(x=>x.label==='Bono asistencia').amount,28000);assert(!r.deductionRows.some(x=>/asistencia|ausencia/i.test(x.label)));});

test('con 20 jornadas y una ausencia se paga 29/30 de los haberes mensuales, incluidas vacaciones pagadas',()=>{
 const normal=calc({worked:29,absent:1}),scheduled=calc({worked:20,absent:1}),vacation=calc({worked:10,vacation:10,absent:1});
 for(const r of [scheduled,vacation]){assert.equal(r.ready,true);assert.equal(r.transfer,normal.transfer);assert.equal(r.incomeRows.find(x=>x.label==='Bono asistencia').amount,29000);assert.equal(r.attendanceBonusLoss,1000);assert.equal(r.adjustments.find(x=>x.label==='Bono asistencia: descuento proporcional').amount,1000);assert.equal(r.absenceSalaryDiscount,30000);}
});

test('la ausencia no rebaja otra vez reemplazos, coberturas ni jornadas ASEO efectivamente realizadas',()=>{
 const extras={replacementDays:2,overtimeHours:4,aseoExtraDays:1},full=calc({...extras,worked:30,absent:0}),absent=calc({...extras,worked:20,absent:1});
 for(const field of ['replacementPay','overtimePay','aseoExtraPay'])assert.equal(absent[field],full[field]);
 assert.equal(absent.advance,50000);assert.equal(absent.transfer,absent.gross-absent.totalDeductions);
});
test('salud se aplica al imponible y las exenciones AFP/cesantía se respetan',()=>{const r=calc({},monthly,{...pension,afpRate:0,afcRate:0});assert.equal(r.afp,0);assert.equal(r.afc,0);assert.equal(r.health,69300);assert.equal(r.transfer,980700);});
test('APV confirmado se descuenta una sola vez',()=>{const r=calc({},monthly,{...pension,apv:10000,apvRegime:'B'});assert.equal(r.apv,10000);assert.equal(r.transfer,853187);assert.equal(r.taxBase,793187);});
test('pago diario usa asistencia efectiva y no vuelve a descontar la ausencia',()=>{const w={...monthly,salaryBasis:'day',base:null,dailyRate:40000,allowances:[{label:'Colación',amount:2500,taxable:false,basis:'day'},{label:'Movilización',amount:3000,taxable:false,basis:'day'}]},p={...pension,afpRate:0,afcRate:0};const r=calc({worked:5,absent:1,advance:0},w,p),r2=calc({worked:5,absent:0,advance:0},w,p);assert.equal(r.totalTaxable,200000);assert.equal(r.nonTaxable,27500);assert.equal(r.transfer,213500);assert.equal(r2.transfer,r.transfer);});
test('se usan los tramos oficiales del período, sin copiar el impuesto anterior',()=>{assert.equal(monthlyTax(974038.5,72151),0);assert.equal(monthlyTax(1000000,72151),1038);assert.equal(monthlyTax(1000000,71721),1271);assert.equal(monthlyTax(2164530,72151),47620);const r=calc({advance:0},{...monthly,base:2000000,allowances:[]});assert.equal(r.taxBase,1622600);assert.equal(r.tax,25942);assert.equal(r.transfer,1596658);});
test('se aplican topes AFP/salud de 90 UF y cesantía de 135,2 UF',()=>{const r=calc({advance:0},{...monthly,base:8000000,allowances:[]});assert.equal(r.afp,418375);assert.equal(r.health,259860);assert.equal(r.afc,33460);});
test('honorarios sin retención: el PPM propio no reduce la transferencia',()=>{const w={...monthly,id:'provider-demo',employmentType:'honorarios',salaryBasis:'day',dailyRate:40000,base:null,allowances:[]},rules={...config,honorarios:{[w.id]:{amountType:'gross',receiverWithholds:false}}};const r=calc({worked:5,advance:10000},w,null,rules);assert.equal(r.gross,200000);assert.equal(r.selfPpm,30500);assert.equal(r.transfer,190000);assert.equal(r.afp,0);assert.equal(r.health,0);assert.equal(r.afc,0);});
test('honorarios con retención distinguen impuesto retenido del PPM del prestador',()=>{const w={...monthly,id:'provider-demo',employmentType:'honorarios',salaryBasis:'day',dailyRate:40000,base:null,allowances:[]},rules={...config,honorarios:{[w.id]:{amountType:'gross',receiverWithholds:true}}};const r=calc({worked:5,advance:10000},w,null,rules);assert.equal(r.withholding,30500);assert.equal(r.selfPpm,0);assert.equal(r.transfer,159500);});
test('un período sin parámetros nunca recibe tasas de otro mes',()=>{const r=calc({period:'2026-11'});assert.equal(r.ready,false);assert.equal(r.transfer,null);assert(r.pending.some(x=>x.includes('2026-11')));});
test('no se inventan tasas previsionales ausentes',()=>{const r=calc({},monthly,{...pension,afcRate:null});assert.equal(r.ready,false);assert.equal(r.transfer,null);});
test('sin asistencia ni ausencia no se muestra un pago final',()=>{assert.equal(calc({worked:0,absent:0}).ready,false);});
test('anticipos excesivos, días fraccionarios y valores inválidos impiden transferir',()=>{for(const d of [{advance:9999999},{worked:30,absent:2},{worked:-1},{absent:0.5},{worked:''},{period:'2026-13'},{advance:1.5}]){const r=calc(d);assert(r.errors.length>0);assert.equal(r.transfer,null);}});
test('ausencia de todo el mes deja colación y movilización en cero',()=>{for(const absent of [30,31]){const r=calc({worked:0,absent,advance:0});assert.equal(r.totalTaxable,0);assert.equal(r.nonTaxable,0);assert.equal(r.transfer,0);}});
test('diez ausencias prorratean cada asignación sin duplicar descuentos',()=>{const r=calc({worked:20,absent:10,advance:0});assert.equal(r.incomeRows.find(x=>x.label==='Colación').amount,33333);assert.equal(r.incomeRows.find(x=>x.label==='Movilización').amount,40000);assert.equal(r.nonTaxable,73333);assert.equal(r.transfer,r.gross-r.totalDeductions);assert(!r.deductionRows.some(x=>/Colación|Movilización/.test(x.label)));});
