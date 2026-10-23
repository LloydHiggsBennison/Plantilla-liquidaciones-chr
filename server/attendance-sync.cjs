const crypto=require('node:crypto');
const {StoreError}=require('./draft-store.cjs');
const fields=['worked','absent','vacation','replacementDays','overtimeHours','aseoExtraDays'];
const labels={worked:'Días base',absent:'Ausencias sin goce',vacation:'Vacaciones pagadas',replacementDays:'Días adicionales',overtimeHours:'Horas de cobertura',aseoExtraDays:'Jornadas extra ASEO con 50%'};
function key(env){if(!env.AUTH_SESSION_SECRET)throw new StoreError(503,'Falta configurar el acceso privado.');return crypto.createHash('sha256').update('chr-attendance-preview-v1|'+env.AUTH_SESSION_SECRET).digest();}
function seal(value,env){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(env),iv);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
function unseal(token,env){
 try{if(typeof token!=='string'||token.length>90000)throw Error();const value=Buffer.from(token,'base64url');const cipher=crypto.createDecipheriv('aes-256-gcm',key(env),value.subarray(0,12));cipher.setAuthTag(value.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(value.subarray(28)),cipher.final()]).toString('utf8'));}
 catch{throw new StoreError(400,'La revisión de cambios no es válida. Vuelve a leer la planilla.');}
}
function admin(identity){if(identity.role!=='admin')throw new StoreError(403,'Solo administración puede actualizar desde la planilla.');}
async function preview(report,service,identity,source='excel',env=process.env,now=Date.now()){
 admin(identity);const current=new Map((await service.list(report.period)).map(x=>[x.worker,x]));
 const previewId=crypto.randomUUID(),candidates=[];
 const rows=report.summaries.map(summary=>{
  const old=current.get(summary.worker),w=service.payroll.WORKERS.find(x=>x.id===summary.worker);
  const row={...summary,changes:[],currentRevision:old?.revision||0,currentAmount:old?.snapshot?.result?.ready?old.snapshot.result.transfer:null,nextAmount:null,state:'blocked',message:''};
  if(old?.status==='transferred'){row.state='transferred';row.nextAmount=row.currentAmount;row.message='Transferencia registrada: el borrador está bloqueado.';return row;}
  if(!w||summary.issues.length||!summary.events.length){row.message=summary.issues.length?'Revisa las observaciones de esta persona.':'Sin registros suficientes del período.';return row;}
  const input={worker:w.id,period:report.period,advance:old?.data?.advance??0};for(const field of fields)input[field]=Number(summary[field]||0);
  if(summary.scheduleReference&&old){row.state='reference';row.message='Horario habitual de referencia. Se conservan las novedades ingresadas manualmente.';row.nextAmount=row.currentAmount;return row;}
  const result=service.payroll.Payroll.calculate(input,w);row.input=input;row.nextAmount=result.ready?result.transfer:null;row.pending=result.pending||[];
  if(result.errors.length){row.message=result.errors.join(' ');return row;}
  row.changes=fields.filter(field=>!old||Number(old.data[field]||0)!==input[field]).map(field=>({field,label:labels[field],before:old?Number(old.data[field]||0):null,after:input[field]}));
  if(old&&!row.changes.length&&row.nextAmount===row.currentAmount){row.state='unchanged';row.message='La asistencia coincide con el borrador guardado.';return row;}
  row.state=old?'changed':'new';row.message=old?'Se actualizará el borrador y se recalculará el monto.':'Se creará un borrador nuevo; registra sus anticipos antes de transferir.';
  candidates.push({worker:w.id,expectedRevision:row.currentRevision,input,sourceHash:crypto.createHash('sha256').update(JSON.stringify(summary.events)).digest('hex')});return row;
 });
 const token=seal({version:1,previewId,username:identity.username,period:report.period,source,readAt:report.readAt,expiresAt:now+15*60*1000,candidates},env);
 return {period:report.period,source,readAt:report.readAt,coverage:report.coverage,issues:report.issues,rows,token};
}
async function apply(input,service,identity,env=process.env,now=Date.now()){
 admin(identity);const data=unseal(input.token,env);
 if(data.version!==1||data.username!==identity.username)throw new StoreError(403,'Esta revisión pertenece a otro acceso. Vuelve a leer la planilla.');
 if(!Number.isFinite(data.expiresAt)||now>data.expiresAt)throw new StoreError(409,'La revisión venció. Vuelve a leer la planilla para revisar datos actuales.');
 if(!Array.isArray(input.workers)||!input.workers.length||input.workers.length>50||input.workers.some(x=>typeof x!=='string')||new Set(input.workers).size!==input.workers.length)throw new StoreError(400,'Selecciona los trabajadores que deseas actualizar.');
 const selected=input.workers.map(id=>data.candidates.find(x=>x.worker===id));if(selected.some(x=>!x))throw new StoreError(400,'La selección contiene registros sin cambios aplicables.');
 const results=[];
 for(const row of selected){
  try{
   const existing=await service.store.get(row.worker+'_'+data.period);
   if(existing?.sourceSync?.previewId===data.previewId){results.push({worker:row.worker,state:'already-applied'});continue;}
   const draft=await service.save({...row.input,expectedRevision:row.expectedRevision},identity,{previewId:data.previewId,source:data.source,readAt:data.readAt,sourceHash:row.sourceHash});
   results.push({worker:row.worker,state:'updated',draft});
  }catch(e){results.push({worker:row.worker,state:'failed',status:e.status||503,error:e.status?e.message:'No se pudo guardar este borrador. Vuelve a leer la planilla.'});}
 }
 return {period:data.period,previewId:data.previewId,results};
}
module.exports={preview,apply};
