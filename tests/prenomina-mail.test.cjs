const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {LocalStore,PostgresStore}=require('../server/draft-store.cjs'),{DraftService}=require('../server/drafts.cjs'),{PrenominaMail,SENDER,mailbox,message}=require('../server/prenomina-mail.cjs'),{calculate}=require('../dist/calculator.js'),rules=require('../dist/payroll-rules.js');
const admin={role:'admin',username:'mail-admin'},committee={role:'committee',username:'mail-committee'},env={AUTH_SESSION_SECRET:'mail-test-secret'.repeat(5),GMAIL_APP_PASSWORD:'0123456789abcdef'};
async function fixture(fn,count=2){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'chr-mail-test-'));try{
 const workers=Array.from({length:count},(_,i)=>({id:'worker-'+(i+1),name:'Persona'+String(i+1).padStart(2,'0'),role:'Prueba',email:'persona'+(i+1)+'@example.org',salaryBasis:'month',employmentType:'employee',base:600000+i*1000,allowances:[]}));
 const payroll={WORKERS:workers,Payroll:{calculate:(d,w)=>calculate(d,w,{rules,pensionData:Object.fromEntries(workers.map(w=>[w.id,{afpRate:.1,healthRate:.07,afcRate:.006}]))})}},service=new DraftService(new LocalStore(path.join(dir,'drafts.json')),payroll),store=new LocalStore(path.join(dir,'mail.json')),delivered=[];
 for(const w of workers)await service.save({worker:w.id,period:'2026-10',worked:20,absent:0,advance:0,expectedRevision:0},admin);
 const transport={sendMail:async data=>{delivered.push(data);return {accepted:data.envelope.to,rejected:[],messageId:data.messageId};}},mail=new PrenominaMail(service,store,{env,transport});await fn({mail,service,store,workers,delivered,transport});
}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('18 correos separados llevan exclusivamente el nombre, dirección y PDF del trabajador correspondiente',async()=>fixture(async({mail,service,store,workers,delivered})=>{
 const review=await mail.preview('2026-10',admin);assert.equal(review.rows.filter(r=>r.eligible).length,18);assert.equal(review.sender,SENDER);
 const sent=await Promise.all(workers.map(w=>mail.send({token:review.token,worker:w.id},admin)));assert(sent.every(r=>r.status==='sent'));assert.equal(delivered.length,18);
 for(const data of delivered){const worker=workers.find(w=>w.email===data.envelope.to[0]);assert(worker);assert.deepEqual(data.envelope,{from:SENDER,to:[worker.email]});assert.deepEqual(data.to,[{name:worker.name,address:worker.email}]);assert.equal(data.cc,undefined);assert.equal(data.bcc,undefined);assert.equal(data.attachments.length,1);assert.equal(data.attachments[0].filename,'Pre-nomina-'+worker.id+'-2026-10.pdf');assert(data.text.includes(worker.name));const pdf=data.attachments[0].content.toString('latin1');assert(pdf.startsWith('%PDF-'));assert(pdf.includes(worker.name));assert(pdf.includes('INFORMATIVA'));assert(pdf.includes('NO ES LIQUIDACI'));for(const other of workers.filter(w=>w.id!==worker.id)){assert(!pdf.includes(other.name));assert(!data.text.includes(other.name));}}
 const repeated=await mail.send({token:review.token,worker:workers[0].id},admin);assert.equal(repeated.status,'sent');assert(repeated.alreadyProcessed);assert.equal(delivered.length,18);const after=await mail.preview('2026-10',admin);assert.equal(after.rows.filter(r=>r.eligible).length,0);assert(after.rows.every(r=>r.canPreview));assert((await mail.previewPdf({token:after.token,worker:workers[0].id},admin)).buffer.toString('latin1').includes(workers[0].name));assert.equal(delivered.length,18);assert.equal((await service.list('2026-10')).length,18);assert.equal((await store.list('2026-10')).length,18);
},18));
test('no permite correos ajenos, adjuntos aportados por cliente, otro período, token alterado ni comité',async()=>fixture(async({mail,delivered})=>{
 const r=await mail.preview('2026-10',admin),input={token:r.token,worker:'worker-1'};
 for(const extra of [{to:'otro@example.org'},{email:'otro@example.org'},{attachments:[]},{period:'2026-11'}])await assert.rejects(()=>mail.send({...input,...extra},admin),e=>e.status===400);
 await assert.rejects(()=>mail.send({...input,worker:'unknown'},admin),e=>e.status===400);await assert.rejects(()=>mail.send({...input,token:'x'+r.token},admin),e=>e.status===400);
 await assert.rejects(()=>mail.send(input,{role:'admin',username:'other'}),e=>e.status===403);
 for(const action of [()=>mail.preview('2026-10',committee),()=>mail.send(input,committee),()=>mail.previewPdf(input,committee)])await assert.rejects(action,e=>e.status===403);
 assert.equal(delivered.length,0);
}));
test('excluye correos pendientes, repetidos y alias de una misma cuenta Gmail',async()=>fixture(async({mail,workers,delivered})=>{
 delete workers[0].email;workers[1].email='bad@example.org, other@example.org';let r=await mail.preview('2026-10',admin);assert(r.rows.every(x=>!x.eligible));
 workers[0].email='nombre.apellido@gmail.com';workers[1].email='nombreapellido+otro@googlemail.com';assert.equal(mailbox(workers[0].email),mailbox(workers[1].email));r=await mail.preview('2026-10',admin);assert(r.rows.every(x=>!x.eligible));assert.equal(delivered.length,0);
}));
test('bloquea borradores incompletos, cambios posteriores, destinatarios cambiados y snapshots de otra persona',async()=>fixture(async({mail,service,workers,delivered})=>{
 let r=await mail.preview('2026-10',admin);await service.save({worker:'worker-1',period:'2026-10',worked:19,absent:1,advance:0,expectedRevision:1},admin);await assert.rejects(()=>mail.send({token:r.token,worker:'worker-1'},admin),e=>e.status===409);
 r=await mail.preview('2026-10',admin);workers[0].email='nuevo@example.org';await assert.rejects(()=>mail.send({token:r.token,worker:'worker-1'},admin),e=>e.status===409);
 const draft=await service.store.get('worker-1_2026-10');draft.snapshot.worker.id='worker-2';await service.store.compareAndSet({...draft,revision:draft.revision+1},draft.revision);assert.equal((await mail.preview('2026-10',admin)).rows[0].eligible,false);
 await service.save({worker:'worker-2',period:'2026-10',worked:0,absent:0,advance:0,expectedRevision:1},admin);assert.equal((await mail.preview('2026-10',admin)).rows[1].eligible,false);assert.equal(delivered.length,0);
}));
test('una revisión vencida o Gmail sin configurar nunca inicia un envío',async()=>fixture(async({mail,delivered})=>{
 let now=1000;mail.now=()=>now;const r=await mail.preview('2026-10',admin);now+=16*60*1000;await assert.rejects(()=>mail.send({token:r.token,worker:'worker-1'},admin),e=>e.status===409);
 mail.env={...env,GMAIL_APP_PASSWORD:''};const next=await mail.preview('2026-10',admin);assert.equal(next.configured,false);await assert.rejects(()=>mail.send({token:next.token,worker:'worker-1'},admin),e=>e.status===503);assert.equal(delivered.length,0);
}));

test('rechaza un PDF con nombre o datos de otra persona aunque conserve el mismo identificador',async()=>fixture(async({mail,service,delivered})=>{
 const original=await service.store.get('worker-1_2026-10');let current=original;
 for(const snapshot of [{...original.snapshot,worker:{...original.snapshot.worker,name:'Persona02'}},{...original.snapshot,data:{...original.snapshot.data,advance:999999}}]){
  current=await service.store.compareAndSet({...original,revision:current.revision+1,snapshot},current.revision);const review=await mail.preview('2026-10',admin);assert.equal(review.rows.find(r=>r.worker==='worker-1').eligible,false);await assert.rejects(()=>mail.send({token:review.token,worker:'worker-1'},admin),e=>e.status===400);
 }
 assert.equal(delivered.length,0);
}));
test('dos pulsaciones o procesos simultáneos solo generan un envío del mismo documento',async()=>fixture(async({mail,delivered})=>{
 const r=await mail.preview('2026-10',admin),input={token:r.token,worker:'worker-1'};const result=await Promise.all([mail.send(input,admin),mail.send(input,admin)]);assert.equal(delivered.length,1);assert(result.some(x=>x.status==='sent'));assert(result.some(x=>x.alreadyProcessed));
}));
test('un acceso rechazado por Gmail admite reintento explícito, conservando el historial',async()=>fixture(async({mail,store,transport,delivered})=>{
 mail.mailer={sendMail:async()=>{throw Object.assign(new Error('private error not returned'),{code:'EAUTH'});}};let r=await mail.preview('2026-10',admin);const failure=await mail.send({token:r.token,worker:'worker-1'},admin);assert.equal(failure.status,'failed');assert(!failure.message.includes('private error'));
 mail.mailer=transport;r=await mail.preview('2026-10',admin);assert(r.rows[0].eligible);assert.equal((await mail.send({token:r.token,worker:'worker-1'},admin)).status,'sent');assert.equal(delivered.length,1);const jobs=await store.list();assert.equal(jobs[0].attempt,2);assert.equal(jobs[0].audit.length,4);
}));
test('una desconexión durante DATA queda sin confirmar y nunca se reintenta automáticamente',async()=>fixture(async({mail,store})=>{
 let calls=0;mail.mailer={sendMail:async()=>{calls++;throw Object.assign(new Error('disconnected'),{code:'ECONNRESET',command:'DATA'});}};const r=await mail.preview('2026-10',admin),input={token:r.token,worker:'worker-1'};
 assert.equal((await mail.send(input,admin)).status,'uncertain');assert.equal((await mail.send(input,admin)).status,'uncertain');assert.equal(calls,1);assert.equal((await mail.preview('2026-10',admin)).rows[0].eligible,false);assert.equal((await store.list())[0].status,'uncertain');
}));
test('si falla el registro después de que Gmail acepte, el resultado queda bloqueado para evitar duplicados',async()=>fixture(async({mail,store,delivered})=>{
 const original=store.compareAndSet.bind(store);store.compareAndSet=(record,revision)=>{if(record.status==='sent')throw Error('db failed');return original(record,revision);};const r=await mail.preview('2026-10',admin),input={token:r.token,worker:'worker-1'};
 assert.equal((await mail.send(input,admin)).status,'uncertain');await mail.send(input,admin);assert.equal(delivered.length,1);assert.equal((await store.list())[0].status,'uncertain');
}));
test('la previsualización PDF y el texto son informativos y no ejecutan envíos',async()=>fixture(async({mail,delivered})=>{
 const r=await mail.preview('2026-10',admin),file=await mail.previewPdf({token:r.token,worker:'worker-1'},admin);assert(file.buffer.toString('latin1').includes('Persona01'));assert.equal(file.filename,'Pre-nomina-worker-1-2026-10.pdf');assert.equal(delivered.length,0);
 const m=message('<Persona>','2026-10');assert(m.html.includes('&lt;Persona&gt;'));assert(m.text.includes('INFORMATIVO Y PROVISIONAL'));assert(m.text.includes('INASISTENCIAS'.toLowerCase()));assert(m.subject.includes('octubre de 2026'));
}));
test('PostgreSQL separa envíos de borradores y solo concede una reserva por documento',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();try{const query={query:async(sql,params)=>(await db.query(sql,params)).rows},drafts=new PostgresStore(null,query),mail=new PostgresStore(null,query,'chr_payroll_mail'),record={id:'email-1',revision:1,period:'2026-10',status:'sending'};await drafts.init();const race=await Promise.all([mail.compareAndSet(record,0),mail.compareAndSet(record,0)]);assert.equal(race.filter(Boolean).length,1);assert.equal((await drafts.list()).length,0);assert.equal((await mail.list()).length,1);assert.throws(()=>new PostgresStore(null,query,'bad_table'));}finally{await db.close();}
});
