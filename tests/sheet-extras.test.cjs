const test=require('node:test'),assert=require('node:assert/strict');
const {analyze,fromXlsx}=require('../server/attendance.cjs'),{calculate}=require('../dist/calculator.js'),rules=require('../dist/payroll-rules.js');
const worker={id:'ariza',name:'Antonio Ariza',base:600000,salaryBasis:'month',employmentType:'employee',allowances:[]};
const roster=[worker,{id:'luis',name:'Luis Alcaino'},{id:'manual-a',name:'Manuel Araya Aparicio'},{id:'manual-g',name:'Manuel Araya Guajardo'}];
const c=value=>({value,color:'FFFFFF'}),header={index:1,cells:Object.fromEntries(Object.entries({1:'Trabajador',3:'Mes',4:'Dia',5:'Cantidad total dias',6:'Cantidad Horas',7:'Total'}).map(([col,value])=>[col,c(value)]))};
const row=(index=3,extra={})=>({index,cells:Object.fromEntries(Object.entries({1:'Antonio Ariza',3:'Octubre',4:'1-8',5:2,6:12,7:55355.3,...extra}).map(([col,value])=>[col,c(value)]))});
function report(rows=[row()],month='2026-10'){
 return analyze([{name:'Turnos',rows:[{index:3,cells:{2:c(month+'-01'),5:c('A.ARIZA'),6:{...c('L.ALCAINO'),color:'F9CB9C'},11:c('ARIZA POR L.ALCAINO')}}]},{name:'Horas Extras Trabajadores',rows:[header,...rows]}],month,roster);
}
const summary=r=>r.summaries.find(s=>s.worker==='ariza');
test('la hoja HHEE reemplaza otros adicionales y conserva días, horas e importe exacto por trabajador/mes',()=>{
 const s=summary(report());assert.equal(s.worked,1);assert.equal(s.sheetExtrasActive,1);assert.equal(s.sheetExtraDays,2);assert.equal(s.sheetExtraHours,12);assert.equal(s.sheetExtraPay,55355);assert.equal(s.replacementDays,0);assert.equal(s.overtimeHours,0);assert.equal(s.aseoExtraDays,0);assert(!s.events.some(e=>e.credit==='replacementDays'));assert.equal(s.events.find(e=>e.kind==='sheetExtras').cell,'A3:G3');assert.deepEqual(s.events.find(e=>e.kind==='sheetExtras').dates,['2026-10-01','2026-10-08']);
 const r=calculate({...s,period:'2026-10',advance:40000},worker,{rules,pensionData:{ariza:{afpRate:.1,healthRate:.07,afcRate:.006}}});assert.equal(r.ready,true);assert.equal(r.extraDays,2);assert.equal(r.sheetOvertimePay,55355);assert.equal(r.totalTaxable,655355);assert.equal(r.incomeRows.filter(x=>x.label.startsWith('Horas extras de planilla')).length,1);assert.equal(r.transfer,r.gross-r.totalDeductions);
});
test('otra fila mensual no altera adicionales de octubre ni se reutiliza un año explícito distinto',()=>{
 for(const month of ['Noviembre','Octubre 2027','2027-10']){const s=summary(report([row(3,{3:month})]));assert(!s.sheetExtrasActive);assert.equal(s.replacementDays,1);}
 const s=summary(report([row(3,{3:'Octubre',4:'',5:0,6:'',7:0})]));assert.equal(s.sheetExtrasActive,1);assert.equal(s.sheetExtraPay,0);assert.equal(s.replacementDays,0);
});

test('fechas reales de Excel y números de día conservan el mes y el año',()=>{
 const s=summary(report([row(3,{3:new Date('2026-10-01T00:00:00Z'),4:new Date('2026-10-08T00:00:00Z'),5:1})]));assert.equal(s.sheetExtraDays,1);assert.deepEqual(s.events.find(e=>e.kind==='sheetExtras').dates,['2026-10-08']);
 const november=summary(report([row(3,{3:'Noviembre',4:'31',5:1})],'2026-11'));assert(november.issues.some(e=>e.message.includes('fuera del mes')));
});
test('filas incompletas, fechas duplicadas y totales incompatibles bloquean a la persona',()=>{
 const incomplete=summary(report([row(3,{4:1,5:1,6:'',7:0})]));assert.equal(incomplete.sheetExtraDays,1);assert.equal(incomplete.sheetExtrasIncomplete,true);
 for(const data of [{6:''},{7:'#VALUE!'},{5:3},{4:'1-1'},{4:'32',5:1},{6:0},{6:-1},{7:0},{4:'',5:0}])assert(summary(report([row(3,data)])).issues.length>0,JSON.stringify(data));
 assert(summary(report([row(),row(4,{4:8,5:1})])).issues.some(e=>e.message.includes('duplicadas')));
 const sum=summary(report([row(3,{4:1,5:1,6:4,7:10000.2}),row(4,{4:8,5:1,6:8,7:20000.4})]));assert.equal(sum.sheetExtraDays,2);assert.equal(sum.sheetExtraHours,12);assert.equal(sum.sheetExtraPay,30001);
});
test('las abreviaturas de ambos Manuel Araya se asignan sin confundirlos',()=>{
 const r=report([row(3,{1:'Manuel Araya A.'}),row(4,{1:'Manuel Araya G.'})]);assert.equal(r.summaries.find(x=>x.worker==='manual-a').sheetExtraHours,12);assert.equal(r.summaries.find(x=>x.worker==='manual-g').sheetExtraHours,12);
});

test('las antiguas notas de horas no bloquean el origen HHEE y no se suman a su importe',()=>{
 const s=summary(analyze([{name:'Turnos',rows:[{index:3,cells:{2:c('2026-10-01'),5:c('A.ARIZA'),11:c('4 hrs ARIZA')}}]},{name:'Horas Extras Trabajadores',rows:[header,row()]}],'2026-10',roster));assert.equal(s.issues.length,0);assert.equal(s.sheetExtraPay,55355);assert.equal(s.overtimeHours,0);
});

test('un cambio en los encabezados impide interpretar otras columnas como importes',()=>{
 const invalid={...header,cells:{...header.cells,6:c('Total'),7:c('Cantidad Horas')}};const r=analyze([{name:'Horas Extras Trabajadores',rows:[invalid,row()]}],'2026-10',roster);assert(r.summaries.every(s=>s.issues.length>0));
});
test('XLSX conserva la hoja HHEE y lee los resultados de fórmulas sin ejecutarlas',async()=>{
 const ExcelJS=require('exceljs'),wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Horas Extras Trabajadores');for(const [col,value]of Object.entries(header.cells))sheet.getCell(1,Number(col)).value=value.value;for(const [col,value]of Object.entries(row().cells))sheet.getCell(3,Number(col)).value=value.value;sheet.getCell('E3').value={formula:'COUNTA(D3)',result:2};sheet.getCell('G3').value={formula:'F3*4612.9416666667',result:55355.3};
 const sheets=await fromXlsx(Buffer.from(await wb.xlsx.writeBuffer())),s=summary(analyze(sheets,'2026-10',roster));assert.equal(s.sheetExtraPay,55355);assert.equal(s.sheetExtraHours,12);
});
test('el importe de HHEE no permite mezclar pagos antiguos ni importes sin un origen válido',()=>{
 const data={period:'2026-10',worked:20,absent:0,advance:0,sheetExtrasActive:1,sheetExtraDays:1,sheetExtraHours:12,sheetExtraPay:55355};const context={rules,pensionData:{ariza:{afpRate:.1,healthRate:.07,afcRate:.006}}};
 for(const change of [{replacementDays:1},{overtimeHours:4},{aseoExtraDays:1},{sheetExtrasActive:0},{sheetExtraPay:1.5},{sheetExtrasActive:2},{sheetExtraHours:0}])assert(calculate({...data,...change},worker,context).errors.length>0,JSON.stringify(change));
});
