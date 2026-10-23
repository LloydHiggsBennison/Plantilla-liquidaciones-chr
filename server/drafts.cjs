const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {StoreError}=require('./draft-store.cjs');
function loadPayroll(root){const context={window:{},Intl};for(const file of ['workers','pension-data','payroll-rules','calculator'])vm.runInNewContext(fs.readFileSync(path.join(root,file+'.js'),'utf8'),context);return context.window;}
function hash(snapshot){return crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');}
function revision(value){if(!Number.isSafeInteger(value)||value<0)throw new StoreError(400,'Falta la versión del borrador.');return value;}
class DraftService{
 constructor(store,payroll){this.store=store;this.payroll=payroll;}
 async list(period){if(period&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new StoreError(400,'Período inválido.');return (await this.store.list(period)).sort((a,b)=>b.period.localeCompare(a.period)||a.snapshot.worker.name.localeCompare(b.snapshot.worker.name));}
 async save(input,identity,sourceSync=null){
  if(identity.role!=='admin')throw new StoreError(403,'El comité tiene acceso de solo lectura a los borradores.');
  const expected=revision(input.expectedRevision),w=this.payroll.WORKERS.find(x=>x.id===input.worker);if(!w)throw new StoreError(400,'Trabajador no válido.');
  const data={worker:w.id,period:input.period,worked:input.worked,absent:input.absent,advance:input.advance,vacation:input.vacation??0,replacementDays:input.replacementDays??0,overtimeHours:input.overtimeHours??0,aseoExtraDays:input.aseoExtraDays??0};
  const result=this.payroll.Payroll.calculate(data,w);if(result.errors.length)throw new StoreError(422,result.errors.join(' '));
  const id=w.id+'_'+data.period,current=await this.store.get(id);
  if(current?.status==='transferred')throw new StoreError(423,'La transferencia ya está registrada. Este borrador está bloqueado.');
  if((current?.revision||0)!==expected)throw new StoreError(409,'El borrador cambió. Actualiza el tablero antes de guardar.');
  const now=new Date().toISOString(),snapshot=JSON.parse(JSON.stringify({worker:w,data,result}));
  const record={id,worker:w.id,period:data.period,revision:expected+1,data,snapshot,status:result.ready?'pending':'draft',createdAt:current?.createdAt||now,savedAt:now,savedBy:identity.username,transferredAt:null,transferredBy:null,reference:'',sourceSync,audit:[...(current?.audit||[]),{action:'saved',by:identity.username,at:now,revision:expected+1,amount:result.transfer,snapshotHash:hash(snapshot),...(sourceSync?{sourceSync}:{})}]};
  const saved=await this.store.compareAndSet(record,expected);if(!saved)throw new StoreError(409,'Otro usuario actualizó este borrador. Recarga el tablero.');return saved;
 }
 async markTransferred(id,input,identity){
  if(!['admin','committee'].includes(identity.role))throw new StoreError(403,'Solo administración y comité pueden registrar transferencias.');
  const expected=revision(input.expectedRevision),current=await this.store.get(id);if(!current)throw new StoreError(404,'No se encontró el borrador.');
  if(current.status==='transferred')return current;
  if(current.revision!==expected)throw new StoreError(409,'El monto o los datos cambiaron. Revisa nuevamente el borrador antes de marcarlo.');
  if(current.status!=='pending'||!current.snapshot.result.ready)throw new StoreError(422,'Completa los datos pendientes antes de registrar la transferencia.');
  const reference=String(input.reference||'').trim();if(reference.length>120)throw new StoreError(400,'La referencia admite hasta 120 caracteres.');
  const at=new Date().toISOString(),record={...current,revision:expected+1,status:'transferred',transferredAt:at,transferredBy:identity.username,reference,audit:[...current.audit,{action:'transferred',by:identity.username,at,revision:expected+1,amount:current.snapshot.result.transfer,reference,snapshotHash:hash(current.snapshot)}]};
  const saved=await this.store.compareAndSet(record,expected);if(!saved){const latest=await this.store.get(id);if(latest?.status==='transferred')return latest;throw new StoreError(409,'El borrador cambió. Revisa su monto actualizado.');}return saved;
 }
}
module.exports={DraftService,loadPayroll};
