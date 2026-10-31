const TITLE='HORAS EXTRAS TRABAJADORES';
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const months=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
function monthMatches(value,period){
 if(value instanceof Date)return !Number.isNaN(value.valueOf())&&value.toISOString().slice(0,7)===period;
 const text=String(value??'').trim(),[year,month]=period.split('-').map(Number);
 if(/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(text))return text.slice(0,7)===period;
 if(typeof value==='number'&&value>31)return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,7)===period;
 const tokens=normalize(text).split(' '),found=months.findIndex(m=>tokens.includes(m));
 if(found>=0){const explicitYear=tokens.find(t=>/^\d{4}$/.test(t));return found+1===month&&(!explicitYear||Number(explicitYear)===year);}
 return /^\d{1,2}$/.test(text)&&Number(text)===month;
}
function number(value){
 if(value==null||String(value).trim()==='')return null;
 if(typeof value==='number')return Number.isFinite(value)?value:NaN;
 let text=String(value).trim().replace(/\$|CLP|\s/gi,'');
 if(/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text))text=text.replace(/\./g,'').replace(',','.');
 else if(/^-?\d+,\d+$/.test(text))text=text.replace(',','.');
 return /^-?\d+(?:\.\d+)?$/.test(text)?Number(text):NaN;
}
function dates(value,period){
 if(value instanceof Date){if(Number.isNaN(value.valueOf()))throw Error('La fecha de horas extras no es válida.');value=value.toISOString().slice(0,10);}
 if(value==null||String(value).trim()==='')return [];
 const text=String(value).trim(),[year,month]=period.split('-').map(Number),end=new Date(Date.UTC(year,month,0)).getUTCDate();
 let tokens;
 if(/^\d{4}-\d{2}-\d{2}$/.test(text)){if(!text.startsWith(period+'-'))throw Error('La fecha no corresponde al mes seleccionado.');tokens=[Number(text.slice(-2))];}
 else if(typeof value==='number'&&value>31){const date=new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);if(!date.startsWith(period+'-'))throw Error('La fecha no corresponde al mes seleccionado.');tokens=[Number(date.slice(-2))];}
 else if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)){const [day,m,y]=text.split('/').map(Number);if(m!==month||y!==year)throw Error('La fecha no corresponde al mes seleccionado.');tokens=[day];}
 else{if(!/^\d{1,2}(?:\s*[-,;]\s*\d{1,2})*$/.test(text))throw Error('Indica los días separados por guiones, por ejemplo 1-8-15.');tokens=text.split(/[-,;]/).map(Number);}
 if(tokens.some(day=>!Number.isInteger(day)||day<1||day>end))throw Error('Hay un día fuera del mes seleccionado.');
 if(new Set(tokens).size!==tokens.length)throw Error('Hay días repetidos en la misma fila.');
 return tokens.map(day=>period+'-'+String(day).padStart(2,'0'));
}
function parse(sheets,period,resolve){
 const sheet=sheets.find(s=>normalize(s.name)===TITLE),records=new Map(),issues=[];
 if(!sheet)return {present:false,records,issues};
 const header=sheet.rows.find(r=>normalize(r.cells[1]?.value)==='TRABAJADOR');
 const aseoColumn=normalize(header?.cells[5]?.value)==='HHEE ASEO',offset=aseoColumn?1:0;
 if(!header||[[3,'MES'],[4,'DIA'],[5+offset,'CANTIDAD TOTAL DIAS'],[6+offset,'CANTIDAD HORAS'],[7+offset,'TOTAL']].some(([col,title])=>normalize(header.cells[col]?.value)!==title)){
  issues.push({sheet:sheet.name,message:'Verifica los encabezados Trabajador, Mes, Día, HHEE Aseo, Cantidad total días, Cantidad Horas y Total.'});return {present:true,records,issues,invalidLayout:true};
 }
 const source=(row,cell)=>({sheet:sheet.name,row:row.index,cell:cell||'A'+row.index+':'+(aseoColumn?'H':'G')+row.index});
 let aseoControlled=false;
 for(const row of sheet.rows){
  if(row.index<=header.index)continue;const value=i=>row.cells[i]?.value,name=String(value(1)||'').trim();
  if(!name||normalize(name)==='TOTAL'||!monthMatches(value(3),period))continue;
  if(aseoColumn)aseoControlled=true;
  const worker=resolve(name),ref=source(row);
  if(!worker){issues.push({...ref,message:'Trabajador sin correspondencia en horas extras: '+name});continue;}
  let record=records.get(worker.id);if(!record){record={worker:worker.id,days:new Set(),observedDays:new Set(),aseoDays:0,observedAseoDays:0,hours:0,rawPay:0,events:[],issues:[]};records.set(worker.id,record);}
  try{
   const list=dates(value(4),period),count=number(value(5+offset)),aseoDays=aseoColumn?(number(value(5))??0):0,hours=number(value(6+offset)),pay=number(value(7+offset));
   for(const date of list)record.observedDays.add(date);
   if(!Number.isInteger(aseoDays)||aseoDays<0||aseoDays>new Date(Number(period.slice(0,4)),Number(period.slice(5,7)),0).getDate())throw Error('Indica una cantidad entera de días en HHEE Aseo dentro del mes.');
   record.observedAseoDays+=aseoDays;
   if(count!==null&&(!Number.isInteger(count)||count<0||count!==list.length))throw Error('La cantidad total de días no coincide con los días indicados.');
   if(hours!==null&&(!Number.isFinite(hours)||hours<0))throw Error('Indica una cantidad de horas válida.');
   if(pay===null||!Number.isFinite(pay)||pay<0)throw Error('Completa el importe Total de horas extras.');
   if((list.length||aseoDays)&&!(hours>0))throw Error('Completa Cantidad Horas para los días indicados y HHEE Aseo.');
   if((hours||pay)&&!list.length&&!aseoDays)throw Error('Indica los días en que se realizaron las horas extras.');
   if(hours>0&&pay<=0)throw Error('Completa el importe Total para las horas registradas.');
   if(list.some(date=>record.days.has(date)))throw Error('Hay fechas duplicadas para el trabajador en este mes.');
   if(aseoDays&&record.aseoDays)throw Error('Registra HHEE Aseo en una sola fila por trabajador y mes.');
   for(const date of list)record.days.add(date);record.aseoDays+=aseoDays;record.hours+=hours||0;record.rawPay+=pay;
   record.events.push({...ref,kind:'sheetExtras',credit:'sheetExtraPay',dates:list,hours:hours||0,days:list.length,aseoDays,pay:Math.round(pay),text:name});
  }catch(error){const item={...ref,worker:worker.id,message:error.message};record.issues.push(item);issues.push(item);}
 }
 for(const record of records.values()){record.pay=Math.round(record.rawPay);record.dayCount=record.issues.length?record.observedDays.size:record.days.size;record.dates=[...record.observedDays].sort();}
 return {present:true,records,issues,aseoControlled};
}
module.exports={parse,monthMatches,number,dates,TITLE};
