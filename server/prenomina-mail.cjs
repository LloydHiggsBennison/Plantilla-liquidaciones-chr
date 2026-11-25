const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {StoreError}=require('./draft-store.cjs');
const SENDER='requerimientoshr@gmail.com';
const ORGANIZATION='Condominio Horizonte de Reñaca';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function address(value){const text=String(value||'').trim().toLowerCase();return text.length<=254&&/^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(text)?text:null;}
function mailbox(value){const email=address(value);if(!email)return null;let [local,domain]=email.split('@');if(['gmail.com','googlemail.com'].includes(domain)){local=local.split('+')[0].replace(/\./g,'');domain='gmail.com';}return local+'@'+domain;}
function admin(identity){if(identity?.role!=='admin')throw new StoreError(403,'Solo administración puede enviar pre nóminas.');}
function periodLabel(period){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period||''))throw new StoreError(400,'Selecciona un período válido.');return new Date(Number(period.slice(0,4)),Number(period.slice(5,7))-1,1).toLocaleDateString('es-CL',{month:'long',year:'numeric'});}
function message(name,period){const month=periodLabel(period),subject='PRE NÓMINA INFORMATIVA · '+month+' · '+ORGANIZATION;
 const paragraphs=['Estimado/a '+name+':','Adjuntamos su PRE NÓMINA de '+month+' para revisión. Si detecta algún error, comuníquese por teléfono con Lloyd para solicitar los ajustes que correspondan.','Este documento es INFORMATIVO Y PROVISIONAL: proyecta las remuneraciones al cierre del mes y puede modificarse por inasistencias, horas extras, reemplazos u otros ajustes.','NO CORRESPONDE A LA LIQUIDACIÓN DE SUELDO OFICIAL NI ACREDITA EL PAGO.','Quedamos atentos.','La Administración\n'+ORGANIZATION];
 return {subject,text:paragraphs.join('\n\n'),html:'<div style="font:15px/1.6 Arial,sans-serif;color:#24352f">'+paragraphs.map((p,i)=>'<p>'+(i===3?'<strong>':'')+escape(p).replace(/\n/g,'<br>')+(i===3?'</strong>':'')+'</p>').join('')+'</div>'};
}
function password(env){return String(env.GMAIL_APP_PASSWORD||'').replace(/\s/g,'');}
function configured(env){return /^[a-zA-Z0-9]{16}$/.test(password(env));}
function key(env){if(!env.AUTH_SESSION_SECRET)throw new StoreError(503,'Falta configurar el acceso privado.');return crypto.createHash('sha256').update('chr-prenomina-mail-v1|'+env.AUTH_SESSION_SECRET).digest();}
function seal(value,env){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(env),iv),bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');}
function unseal(token,env){try{if(typeof token!=='string'||token.length>30000)throw Error();const bytes=Buffer.from(token,'base64url'),dec=crypto.createDecipheriv('aes-256-gcm',key(env),bytes.subarray(0,12));dec.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([dec.update(bytes.subarray(28)),dec.final()]).toString('utf8'));}catch{throw new StoreError(400,'La revisión de destinatarios no es válida. Ábrela nuevamente.');}}
function documentHash(snapshot){return hash({worker:{id:snapshot.worker.id,name:snapshot.worker.name,role:snapshot.worker.role},data:snapshot.data,result:snapshot.result});}
function validDraft(record,worker,period){return record?.id===worker.id+'_'+period&&record.worker===worker.id&&record.period===period&&record.data?.worker===worker.id&&record.data?.period===period&&record.snapshot?.worker?.id===worker.id&&record.snapshot.worker.name===worker.name&&record.snapshot?.data?.worker===worker.id&&record.snapshot?.data?.period===period&&isDeepStrictEqual(record.snapshot.data,record.data)&&record.snapshot?.result?.ready===true&&Array.isArray(record.snapshot.result.errors)&&record.snapshot.result.errors.length===0&&Number.isFinite(record.snapshot.result.transfer);}
function pdf(record){const {jsPDF}=require('jspdf'),build=require('../dist/pdf.js');const {worker,data,result}=record.snapshot;return Buffer.from(build(jsPDF,worker,data,result,{informational:true}).output('arraybuffer'));}
function transport(env){if(!configured(env))throw new StoreError(503,'Configura GMAIL_APP_PASSWORD en Vercel para habilitar los envíos.');return require('nodemailer').createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:SENDER,pass:password(env)},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,disableFileAccess:true,disableUrlAccess:true});}
class PrenominaMail{
 constructor(service,store,options={}){this.service=service;this.store=store;this.env=options.env||process.env;this.now=options.now||Date.now;this.mailer=options.transport;this.makePdf=options.makePdf||pdf;}
 roster(){return this.service.payroll.WORKERS;}
 deliveryId(record,email){return hash({worker:record.worker,period:record.period,document:documentHash(record.snapshot),recipient:mailbox(email)});}
 async preview(period,identity){admin(identity);periodLabel(period);const drafts=new Map((await this.service.list(period)).map(d=>[d.worker,d])),candidates=[];
  const rows=await Promise.all(this.roster().map(async worker=>{const email=address(worker.email),record=drafts.get(worker.id),row={worker:worker.id,name:worker.name,role:worker.role,email:email||'',filename:'Pre-nomina-'+worker.id+'-'+period+'.pdf',revision:record?.revision||0,eligible:false,status:'blocked',message:''};
   if(!email){row.message='Correo pendiente de configurar.';return row;}
   if(mailbox(email)===mailbox(SENDER)||this.roster().filter(w=>mailbox(w.email)===mailbox(email)).length!==1){row.message='Correo compartido o repetido: confirma una dirección exclusiva del trabajador.';return row;}
   if(!record){row.message='Guarda el borrador de este período.';return row;}
   if(!validDraft(record,worker,period)){row.message='Completa el cálculo y guarda el borrador antes de enviarlo.';return row;}
   const delivery=await this.store.get(this.deliveryId(record,email));row.status=delivery?.status||'ready';row.sentAt=delivery?.sentAt||null;row.canPreview=true;
   candidates.push({worker:worker.id,email,revision:record.revision,snapshotHash:hash(record.snapshot)});
   if(['sent','sending','uncertain'].includes(row.status)){row.message=row.status==='sent'?'Esta versión ya fue enviada.':row.status==='sending'?'Envío iniciado. Comprueba el registro en Gmail si no se completa.':'Resultado sin confirmar: revisa Enviados en Gmail. No se reenvía automáticamente.';return row;}
   row.eligible=true;row.message=row.status==='failed'?'No se envió. Puedes volver a intentarlo.':'Listo para revisión.';return row;
  }));
  return {period,sender:SENDER,configured:configured(this.env),rows,template:message('[nombre del trabajador]',period).text,token:seal({username:identity.username,period,expiresAt:this.now()+15*60*1000,rows:candidates},this.env)};
 }
 async resolve(input,identity){admin(identity);if(!input||Object.keys(input).some(k=>!['token','worker'].includes(k)))throw new StoreError(400,'El envío solo admite la selección del trabajador.');const review=unseal(input.token,this.env);if(review.username!==identity.username)throw new StoreError(403,'Esta revisión pertenece a otro administrador.');if(review.expiresAt<=this.now())throw new StoreError(409,'La revisión venció. Actualiza los destinatarios.');periodLabel(review.period);
  const selected=review.rows.find(r=>r.worker===input.worker),worker=this.roster().find(w=>w.id===input.worker);if(!selected||!worker)throw new StoreError(400,'El trabajador no pertenece a la revisión.');
  const email=address(worker.email);if(!email||selected.email!==email||mailbox(email)===mailbox(SENDER)||this.roster().filter(w=>mailbox(w.email)===mailbox(email)).length!==1)throw new StoreError(409,'El correo cambió o está repetido. Revisa los destinatarios.');
  const record=await this.service.store.get(worker.id+'_'+review.period);if(!validDraft(record,worker,review.period)||record.revision!==selected.revision||hash(record.snapshot)!==selected.snapshotHash)throw new StoreError(409,'El borrador cambió. Revisa la versión actual antes de enviarla.');return {worker,email,record};
 }
 async previewPdf(input,identity){const {record,worker}=await this.resolve(input,identity);return {filename:'Pre-nomina-'+worker.id+'-'+record.period+'.pdf',buffer:this.makePdf(record)};}
 async send(input,identity){const {worker,email,record}=await this.resolve(input,identity);if(!configured(this.env))throw new StoreError(503,'Configura GMAIL_APP_PASSWORD en Vercel para habilitar los envíos.');
  const id=this.deliveryId(record,email),old=await this.store.get(id);if(old&&['sent','sending','uncertain'].includes(old.status))return {worker:worker.id,status:old.status,alreadyProcessed:true,message:old.status==='sent'?'Esta versión ya fue enviada.':'El envío ya fue iniciado. Comprueba su estado en Gmail.'};
  const at=new Date(this.now()).toISOString(),claim={id,revision:(old?.revision||0)+1,worker:worker.id,period:record.period,recipient:email,sourceRevision:record.revision,snapshotHash:hash(record.snapshot),documentHash:documentHash(record.snapshot),status:'sending',startedAt:at,by:identity.username,attempt:(old?.attempt||0)+1,audit:[...(old?.audit||[]),{status:'sending',at,by:identity.username}]};
  if(!await this.store.compareAndSet(claim,old?.revision||0))return {worker:worker.id,status:'sending',alreadyProcessed:true,message:'Otro envío ya está en proceso.'};
  let attempted=false,accepted=false;
  const finish=async(status,extra={})=>{const now=new Date(this.now()).toISOString(),next={...claim,...extra,status,revision:claim.revision+1,audit:[...claim.audit,{status,at:now,by:identity.username}]};return this.store.compareAndSet(next,claim.revision);};
  try{
   const fresh=await this.service.store.get(record.id);if(fresh?.revision!==record.revision||hash(fresh.snapshot)!==hash(record.snapshot)){await finish('failed',{errorCode:'SOURCE_CHANGED'});throw new StoreError(409,'El borrador cambió. Revisa nuevamente antes de enviar.');}
   const bytes=this.makePdf(record);if(!Buffer.isBuffer(bytes)||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('PDF_INVALID');
   const body=message(worker.name,record.period),filename='Pre-nomina-'+worker.id+'-'+record.period+'.pdf',mailer=this.mailer||transport(this.env);
   attempted=true;const response=await mailer.sendMail({from:{name:ORGANIZATION,address:SENDER},to:[{name:worker.name,address:email}],replyTo:SENDER,envelope:{from:SENDER,to:[email]},subject:body.subject,text:body.text,html:body.html,messageId:'<chr-prenomina-'+id+'@gmail.com>',attachments:[{filename,content:bytes,contentType:'application/pdf'}],disableFileAccess:true,disableUrlAccess:true});
   accepted=response.accepted?.length===1&&address(response.accepted[0])===email&&!response.rejected?.length;
   if(!accepted){const rejected=response.rejected?.length===1&&address(response.rejected[0])===email&&!response.accepted?.length;await finish(rejected?'failed':'uncertain',{errorCode:rejected?'RECIPIENT_REJECTED':'UNCONFIRMED'});return {worker:worker.id,status:rejected?'failed':'uncertain',stopBatch:!rejected,message:rejected?'Gmail rechazó esta dirección. Confirma el correo del trabajador.':'Gmail no confirmó el resultado. Revisa Enviados antes de repetir.'};}
   if(!await finish('sent',{sentAt:new Date(this.now()).toISOString(),messageId:String(response.messageId||'').slice(0,200)}))throw new Error('AUDIT_UNCONFIRMED');
   return {worker:worker.id,status:'sent',message:'Correo aceptado por Gmail para envío.'};
  }catch(error){
   if(error instanceof StoreError)throw error;
   const safeFailure=!accepted&&(!attempted||['EAUTH','EDNS'].includes(error.code)||['CONN','EHLO','HELO','STARTTLS','AUTH PLAIN','AUTH LOGIN','MAIL FROM','RCPT TO'].includes(error.command));
   const status=safeFailure?'failed':'uncertain';try{await finish(status,{errorCode:accepted?'AUDIT_UNCONFIRMED':String(error.code||'UNCONFIRMED').slice(0,40)});}catch{}
   return {worker:worker.id,status,stopBatch:true,message:status==='uncertain'?'No se pudo confirmar el resultado. Revisa Enviados en Gmail; no se reenvía automáticamente.':error.code==='EAUTH'?'Gmail rechazó el acceso. Revisa la contraseña de aplicación en Vercel.':'No se pudo completar el envío. Revisa la conexión de Gmail antes de reintentar.'};
  }
 }
}
module.exports={PrenominaMail,SENDER,address,mailbox,message,configured,validDraft};
