const crypto=require('node:crypto');
const SOURCE_ID='19FFzRWT4JorQEA8gktYIumVwf59fxTLI2Jr95Av5IrQ';
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const knownAliases={
 'Luis Alcaino':['L ALCAINO','LUIS ALCAINO'], 'Alexis Bernal':['A BERNAL','ALEXIS BERNAL'],
 'Antonio Ariza':['A ARIZA','ARIZA'], 'Eduardo Bernal':['E BERNAL','EDUARDO BERNAL'],
 'Manuel Araya Guajardo':['M ARAYA G','MANUEL ARAYA GUAJARDO'], 'Manuel Araya Aparicio':['M ARAYA A','MANUEL ARAYA APARICIO'],
 'Angel Villegas':['A VILLEGAS','VILLEGAS'], 'Luis San Martin':['L SAN MARTIN','SAN MARTIN'],
 'Jose Cortes':['J CORTES','CORTES'], 'Victor Diaz':['V DIAZ','DIAZ'],
 'Eduardo de la Prida':['E DE LA PRIDA','DE LA PRIDA'], 'Cristian Allendes':['C ALLENDES','ALLENDES'],
 'Juan Ponce':['J PONCE','JUAN PONCE'], 'Sergio Cuello':['S CUELLO','SERGIO','CUELLO'],
 'Gloria Ponce':['G PONCE','GLORIA'], 'Ricardo Matamala':['R MATAMALA','MATAMALA'],
 'Cristofer Alcaino':['C ALCAINO','CRISTOFER ALCAINO'], 'Juan Vergara':['J VERGARA','VERGARA']
};
function colorKind(color){
 const rgb=String(color||'FFFFFF').replace(/^FF(?=[A-F0-9]{6}$)/i,'').toUpperCase();
 if(['FFFFFF',''].includes(rgb))return 'worked';
 if(['FFFF00','FFF2CC','FFE599'].includes(rgb))return 'worked';
 if(['FF0000','E06666'].includes(rgb))return 'absent';
 if(['F9CB9C','FCE5CD','F4B183','F8CBAD','FCE4D6','FFC0CB','F4B6C2','F4CCCC'].includes(rgb))return 'vacation';
 return 'unknown';
}
function excelDate(value){
 if(value instanceof Date)return value.toISOString().slice(0,10);
 if(typeof value==='number')return new Date(Date.UTC(1899,11,30)+Math.round(value*86400000)).toISOString().slice(0,10);
 if(/^\d{4}-\d{2}-\d{2}/.test(String(value)))return String(value).slice(0,10);
 const m=String(value||'').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null;
}
function textValue(value){if(value==null)return '';if(typeof value==='object'){if(value.richText)return value.richText.map(x=>x.text).join('');if('result' in value)return textValue(value.result);if(value.text)return value.text;}return String(value);}
async function fromXlsx(buffer){
 if(buffer.length>2*1024*1024)throw Error('La planilla debe pesar menos de 2 MB.');
 const ExcelJS=require('exceljs'),wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);const sheets=[];
 for(const sheet of wb.worksheets){if(!['TURNOS','NOCHEROS','ASEO'].includes(norm(sheet.name)))continue;
  if(sheet.rowCount>3000||sheet.columnCount>100)throw Error('La planilla supera el tamaño de lectura permitido.');
  const rows=[];sheet.eachRow({includeEmpty:false},(row,index)=>{const cells={};row.eachCell({includeEmpty:true},(cell,col)=>{
   const fill=cell.fill?.fgColor?.argb||'FFFFFF';cells[col]={value:cell.value instanceof Date?cell.value:textValue(cell.value),color:fill,ref:cell.address,note:typeof cell.note==='string'?cell.note:''};
  });rows.push({index,cells});});sheets.push({name:sheet.name,rows});
 }return sheets;
}
function rgbColor(value){if(!value)return 'FFFFFF';return ['red','green','blue'].map(k=>Math.round((value[k]||0)*255).toString(16).padStart(2,'0')).join('').toUpperCase();}
async function fromGoogle(env=process.env,fetcher=fetch){
 const email=env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n');
 if(!email||!key){const e=Error('Conecta la cuenta de servicio de Google para leer la planilla, o descarga el archivo Excel desde Google Sheets y cárgalo aquí.');e.status=503;throw e;}
 const now=Math.floor(Date.now()/1000),b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const body=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const assertion=body+'.'+crypto.sign('RSA-SHA256',Buffer.from(body),key).toString('base64url');
 const tokenResponse=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
 if(!tokenResponse.ok)throw Error('No se pudo autenticar la cuenta de servicio de Google.');const token=await tokenResponse.json();
 const query=new URLSearchParams({includeGridData:'true',fields:'sheets(properties(title),data(startRow,startColumn,rowData(values(effectiveValue,formattedValue,effectiveFormat(backgroundColor),note))))'});
 for(const name of ['Turnos','Nocheros','ASEO'])query.append('ranges',`'${name}'!A1:K3000`);
 const response=await fetcher(`https://sheets.googleapis.com/v4/spreadsheets/${SOURCE_ID}?${query}`,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Google no permitió leer la planilla. Comparte el documento como lector con la cuenta de servicio y verifica los nombres de las hojas.');
 const data=await response.json();return data.sheets.map(s=>({name:s.properties.title,rows:s.data.flatMap(g=>(g.rowData||[]).map((r,i)=>({index:(g.startRow||0)+i+1,cells:Object.fromEntries((r.values||[]).map((c,j)=>{const col=(g.startColumn||0)+j+1;return [col,{value:c.effectiveValue?.numberValue??c.formattedValue??c.effectiveValue?.stringValue??'',color:rgbColor(c.effectiveFormat?.backgroundColor),ref:String.fromCharCode(64+col)+((g.startRow||0)+i+1),note:c.note||''}];}))})))}));
}
function analyze(sheets,period,workers){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period||''))throw Error('Selecciona un mes válido.');
 const roster=workers.map(w=>({...w,aliases:[norm(w.name),...(knownAliases[Object.keys(knownAliases).find(k=>norm(k)===norm(w.name))]||[]).map(norm)]}));
 const byName=name=>roster.find(w=>norm(w.name)===norm(name));
 function matches(value,sheet){const t=' '+norm(value)+' ';return roster.filter(w=>w.aliases.some(a=>t.includes(' '+a+' ')));}
 function one(value,sheet){const found=matches(value,sheet);return found.length===1?found[0]:null;}
 const summaries=new Map(roster.map(w=>[w.id,{worker:w.id,name:w.name,role:w.role,worked:0,absent:0,vacation:0,replacementDays:0,overtimeHours:0,aseoExtraDays:0,issues:[],events:[]}]));
 const issues=[],days=new Map(),replacements=new Map(),sourceDates={},aseoExtras=new Map();
 function issue(message,source,ids=[]){const item={message,...source};issues.push(item);for(const id of ids)if(summaries.has(id))summaries.get(id).issues.push(item);}
 function record(w,kind,source){const key=w.id+'|'+source.date;const old=days.get(key);if(old&&old.kind!==kind){if(kind==='worked')return;if(old.kind!=='worked'){issue('Estados incompatibles para la misma fecha.',source,[w.id]);return;}}if(!old||kind!=='worked')days.set(key,{worker:w.id,kind,...source});}
 const special=new Set(['Angel Villegas','Luis San Martin','Eduardo de la Prida'].map(n=>byName(n)?.id).filter(Boolean));
 for(const sheet of sheets){const name=norm(sheet.name);if(!['TURNOS','NOCHEROS','ASEO'].includes(name))continue;const header=sheet.rows.find(r=>r.index===2)?.cells||{};
  for(const row of sheet.rows){if(row.index<3)continue;const date=excelDate(row.cells[name==='ASEO'?1:2]?.value);if(!date||!date.startsWith(period+'-'))continue;
   (sourceDates[sheet.name]??=new Set()).add(date);const observation=String(row.cells[name==='TURNOS'?11:name==='NOCHEROS'?7:10]?.value||'');
   const source={sheet:sheet.name,date,row:row.index};const cols=name==='ASEO'?[3,4,5,6,7,8,9]:name==='NOCHEROS'?[4,5]:[5,6,7,8,9,10];const absent=[];
   for(const col of cols){const cell=row.cells[col];if(!cell)continue;const value=String(cell.value||'').trim();if(!value)continue;
    // Former employee: keep historical source cells, but do not import this column.
    if(['L RETAMALES','RETAMALES'].includes(norm(name==='ASEO'?header[col]?.value:value)))continue;
    const w=one(name==='ASEO'?header[col]?.value:value,sheet.name);const ref={...source,cell:cell.ref};
    if(['LIBRE','APOYO','PV 16 24'].includes(norm(value))){if(name==='TURNOS'&&col===10&&['APOYO','PV 16 24'].includes(norm(value))){const support=byName('Cristian Allendes');if(support)record(support,'worked',{...ref,text:value});}continue;}
    if(!w){if(!/^M ALCAINO$/.test(norm(value)))issue('Nombre sin correspondencia: '+(name==='ASEO'?header[col]?.value:value),ref);continue;}
    let kind=colorKind(cell.color);if(norm(value)==='VAC')kind='vacation';
    if(norm(value)==='LM'){issue('Licencia médica: requiere revisar el tratamiento del período.',ref,[w.id]);continue;}
    if(kind==='unknown'){issue('Color no definido: '+cell.color,ref,[w.id]);continue;}
    if(name==='ASEO'&&(new Date(date+'T00:00:00Z').getUTCDay()===0||norm(w.name)==='LUIS ALCAINO')){
     const sunday=new Date(date+'T00:00:00Z').getUTCDay()===0;
     if(kind!=='worked'){
      if(norm(w.name)==='LUIS ALCAINO')summaries.get(w.id).events.push({...ref,kind,credit:'Sin adicional de aseo',text:value});
      else record(w,kind,{...ref,text:value});
      continue;
     }
     const credit=sunday?'aseoExtraDays':'replacementDays';
     aseoExtras.set(date+'|'+w.id,{...ref,worker:w.id,kind:'worked',credit,amount:1,text:value,observation:sunday?'Jornada adicional de domingo en ASEO: valor del día + 50%':'Jornada adicional de ASEO: valor de un día'});continue;
    }
    if(kind==='absent')absent.push(w.id);record(w,kind,{...ref,text:value});
   }
   if(!observation)continue;
   for(const segment of observation.split(/\s*\/\s*|\n/).filter(Boolean)){
    const clean=norm(segment),found=matches(segment,sheet.name);let replacer,missing;
    const pair=clean.split(/\s+POR\s+/);
    if(pair.length===2){replacer=one(pair[0],sheet.name);missing=one(pair[1],sheet.name);if(!missing&&name==='NOCHEROS'&&norm(pair[1]).startsWith('BERNAL'))missing=roster.find(w=>absent.includes(w.id)&&norm(w.name).includes('BERNAL'));}
    else if(name==='ASEO'&&/VACACIONES/.test(clean)){
     // ASEO uses "Juan vacaciones / Gloria" across two slash-separated pieces.
     continue;
    }else if(/CUBRE AMBAS/.test(clean)&&found.length===1){
     if(name==='NOCHEROS'&&date==='2026-10-14'&&norm(found[0].name)==='LUIS ALCAINO'){
      replacements.set(date+'|'+found[0].id+'|post-coverage',{replacer:found[0].id,missing:null,...source,observation:segment,kind:'post-coverage'});continue;
     }
     replacer=found[0];missing=roster.find(w=>absent.includes(w.id));
    }
    if(!replacer||!missing){if(name==='ASEO')continue;if(found.length===1&&absent.includes(found[0].id)&&pair.length===1)continue;if(/M ALCAINO/.test(clean)&&replacer){const key=date+'|'+replacer.id+'|MARIA';if(!replacements.has(key)){replacements.set(key,{replacer:replacer.id,missing:null,...source,observation:segment,kind:'honorarios-day'});record(replacer,'worked',{...source,cell:'G'+row.index,text:segment});}continue;}issue('Reemplazo pendiente de interpretar: '+segment,source,found.map(w=>w.id));continue;}
    const key=date+'|'+replacer.id+'|'+missing.id;if(replacements.has(key))continue;
    replacements.set(key,{replacer:replacer.id,missing:missing.id,...source,observation:segment,kind:/CAMBIO INTERNO/.test(clean)?'internal':'replacement'});
   }
   if(name==='ASEO'){
    const parts=observation.split('/');if(parts.length===2){let missing=one(parts[0],sheet.name),replacer=one(parts[1],sheet.name);
     if(!missing&&/\bJUAN\b/.test(norm(parts[0])))missing=byName('Juan Vergara');
     if(missing&&replacer){const key=date+'|'+replacer.id+'|'+missing.id;replacements.set(key,{replacer:replacer.id,missing:missing.id,...source,observation,kind:'replacement'});}else issue('Los dos nombres del reemplazo requieren revisión: '+observation,source);
    }
   }
  }
 }
 // Maintenance has a habitual schedule rather than an assignment column.
 const maintenance=byName('Juan Ponce');
 if(maintenance&&Object.values(sourceDates).some(d=>d.size)&&![...days.values()].some(e=>e.worker===maintenance.id)){
  summaries.get(maintenance.id).scheduleReference='Horario habitual: lunes a viernes, 08:00–16:00. Revisar novedades del mes.';
  const [year,month]=period.split('-').map(Number),end=new Date(Date.UTC(year,month,0)).getUTCDate();
  for(let day=1;day<=end;day++){
   const date=new Date(Date.UTC(year,month-1,day));if([0,6].includes(date.getUTCDay()))continue;
   record(maintenance,'worked',{date:date.toISOString().slice(0,10),sheet:'Horario habitual',text:'Lunes a viernes, 08:00–16:00'});
  }
 }
 // One day per worker/date, even when the name appears in both day and afternoon columns.
 for(const event of days.values()){const s=summaries.get(event.worker);s[event.kind==='vacation'?'vacation':event.kind==='absent'?'absent':'worked']++;s.events.push(event);}
 for(const event of aseoExtras.values()){const s=summaries.get(event.worker);s[event.credit]+=event.amount;s.events.push(event);}
 const sharedHandled=new Set();
 for(const date of new Set([...days.values()].map(e=>e.date))){
  if(date==='2026-10-16')continue;
  const missing=[...days.values()].filter(e=>e.date===date&&special.has(e.worker)&&['absent','vacation'].includes(e.kind));
  const uncovered=missing.filter(e=>![...replacements.values()].some(x=>x.date===date&&x.missing===e.worker&&!special.has(x.replacer)));
  if(!uncovered.length)continue;
  const present=[...days.values()].filter(e=>e.date===date&&special.has(e.worker)&&e.kind==='worked');
  const type=uncovered.length===1&&present.length===2?'overtimeHours':uncovered.length===2&&present.length===1?'replacementDays':null;
  if(!type){issue('Cobertura del turno compartido pendiente de confirmar.',uncovered[0],[...uncovered,...present].map(e=>e.worker));continue;}
  const amount=type==='overtimeHours'?4:1;
  for(const e of present){const s=summaries.get(e.worker);s[type]+=amount;s.events.push({...e,credit:type,amount,observation:'Cobertura del turno compartido',missing:uncovered.map(x=>x.worker)});}
  for(const e of uncovered)sharedHandled.add(date+'|'+e.worker);
 }
 const fullSpecialDays=new Set();
 for(const e of replacements.values()){
  const s=summaries.get(e.replacer);if(e.kind==='honorarios-day'){s.events.push(e);continue;}
  if(e.kind==='post-coverage'){s.overtimeHours+=4;s.events.push({...e,credit:'overtimeHours',amount:4});continue;}
  if(norm(e.sheet)==='ASEO'&&aseoExtras.has(e.date+'|'+e.replacer))continue;
  if(e.kind==='internal'){issue('Cambio interno: confirmar si genera un adicional.',e,[e.replacer]);continue;}
  if(e.date==='2026-10-16'&&norm(s.name)==='CRISTIAN ALLENDES'){s.events.push({...e,credit:'Sin adicional: excepción confirmada'});continue;}
  if(special.has(e.replacer)&&special.has(e.missing)){
   if(!sharedHandled.has(e.date+'|'+e.missing))issue('Revisar quiénes cubrieron el turno compartido.',e,[e.replacer]);
   continue;
  }
  if(special.has(e.missing)){const key=e.date+'|'+e.replacer;if(fullSpecialDays.has(key))continue;fullSpecialDays.add(key);}
  s.replacementDays++;s.events.push({...e,credit:'replacementDays',amount:1});
 }
 const required=['TURNOS','NOCHEROS','ASEO'];for(const name of required){const entry=Object.entries(sourceDates).find(([k])=>norm(k)===name);if(!entry)issue('No hay fechas del período en la hoja '+name+'.',{});}
 return {period,source:'Google Sheets / Excel',readAt:new Date().toISOString(),summaries:[...summaries.values()],issues,coverage:Object.fromEntries(Object.entries(sourceDates).map(([k,v])=>[k,v.size]))};
}
module.exports={analyze,fromXlsx,fromGoogle,colorKind,excelDate,SOURCE_ID};
