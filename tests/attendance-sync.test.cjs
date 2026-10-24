const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {LocalStore}=require('../server/draft-store.cjs'),{DraftService}=require('../server/drafts.cjs'),sync=require('../server/attendance-sync.cjs');
const {calculate}=require('../dist/calculator.js'),rules=require('../dist/payroll-rules.js');
const admin={role:'admin',username:'admin-test'},committee={role:'committee',username:'committee-test'},env={AUTH_SESSION_SECRET:'s'.repeat(64)};
const worker={id:'demo',name:'Persona de prueba',role:'Prueba',salaryBasis:'month',employmentType:'employee',base:900000,allowances:[{label:'Bono asistencia',amount:30000,basis:'month',taxable:true}]};
const payroll={WORKERS:[worker],Payroll:{calculate:(d,w)=>calculate(d,w,{rules,pensionData:{demo:{afpRate:.1,healthRate:.07,afcRate:.006}}})}};
const data={worker:'demo',period:'2026-10',worked:20,absent:0,vacation:0,replacementDays:0,overtimeHours:0,advance:40000,expectedRevision:0};
const report=(extra={})=>({period:'2026-10',readAt:'2026-10-23T20:00:00Z',coverage:{Turnos:31,Nocheros:31,ASEO:31},issues:[],summaries:[{worker:'demo',name:worker.name,role:worker.role,worked:19,absent:1,vacation:0,replacementDays:0,overtimeHours:0,events:[{date:'2026-10-22',sheet:'Turnos',cell:'E85',kind:'absent'}],issues:[],...extra}]});
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'chr-sync-'));try{const service=new DraftService(new LocalStore(path.join(dir,'drafts.json')),payroll);await service.save(data,admin);await fn(service);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('previsualiza sin guardar; aplicar conserva anticipos y recalcula sueldo y cotizaciones',async()=>fixture(async service=>{
 const old=await service.store.get('demo_2026-10'),preview=await sync.preview(report(),service,admin,'excel',env);
 assert.equal((await service.store.get(old.id)).revision,1);assert.equal(preview.rows[0].state,'changed');assert.equal(preview.rows[0].input.advance,40000);assert.deepEqual(preview.rows[0].changes.map(x=>x.field),['worked','absent']);assert(preview.rows[0].nextAmount<old.snapshot.result.transfer);
 const applied=await sync.apply({token:preview.token,workers:['demo']},service,admin,env);assert.equal(applied.results[0].state,'updated');const saved=await service.store.get(old.id);assert.equal(saved.revision,2);assert.equal(saved.data.advance,40000);assert.equal(saved.data.absent,1);assert(saved.sourceSync.previewId);assert.equal(saved.snapshot.result.attendanceBonusLoss,1000);
 const again=await sync.apply({token:preview.token,workers:['demo']},service,admin,env);assert.equal(again.results[0].state,'already-applied');assert.equal((await service.store.get(old.id)).revision,2);
}));
test('rechaza revisión alterada, selección ajena, otro usuario y revisión vencida',async()=>fixture(async service=>{
 const p=await sync.preview(report(),service,admin,'google',env,1000);const i=40,tampered=p.token.slice(0,i)+(p.token[i]==='A'?'B':'A')+p.token.slice(i+1);
 await assert.rejects(()=>sync.apply({token:tampered,workers:['demo']},service,admin,env,1000),e=>e.status===400);
 await assert.rejects(()=>sync.apply({token:p.token,workers:['otro']},service,admin,env,1000),e=>e.status===400);
 await assert.rejects(()=>sync.apply({token:p.token,workers:['demo']},service,{...admin,username:'other'},env,1000),e=>e.status===403);
 await assert.rejects(()=>sync.apply({token:p.token,workers:['demo']},service,admin,env,1000+16*60*1000),e=>e.status===409);
}));
test('el comité no puede previsualizar ni aplicar actualizaciones',async()=>fixture(async service=>{
 await assert.rejects(()=>sync.preview(report(),service,committee,'excel',env),e=>e.status===403);
 const p=await sync.preview(report(),service,admin,'excel',env);await assert.rejects(()=>sync.apply({token:p.token,workers:['demo']},service,committee,env),e=>e.status===403);
}));
test('no sobrescribe cambios manuales posteriores a la revisión',async()=>fixture(async service=>{
 const p=await sync.preview(report(),service,admin,'excel',env);await service.save({...data,advance:70000,expectedRevision:1},admin);
 const result=await sync.apply({token:p.token,workers:['demo']},service,admin,env);assert.equal(result.results[0].status,409);const saved=await service.store.get('demo_2026-10');assert.equal(saved.data.advance,70000);assert.equal(saved.data.absent,0);
}));
test('una transferencia registrada después de revisar bloquea la actualización',async()=>fixture(async service=>{
 const p=await sync.preview(report(),service,admin,'excel',env);await service.markTransferred('demo_2026-10',{expectedRevision:1,reference:'LOCAL TEST'},committee);
 const result=await sync.apply({token:p.token,workers:['demo']},service,admin,env);assert.equal(result.results[0].status,423);const saved=await service.store.get('demo_2026-10');assert.equal(saved.status,'transferred');assert.equal(saved.data.absent,0);
 const next=await sync.preview(report(),service,admin,'excel',env);assert.equal(next.rows[0].state,'transferred');
}));
test('no inventa asistencia al faltar registros ni altera una referencia habitual ya guardada',async()=>fixture(async service=>{
 const empty=await sync.preview(report({events:[]}),service,admin,'excel',env);assert.equal(empty.rows[0].state,'blocked');
 const reference=await sync.preview(report({scheduleReference:'Horario habitual'}),service,admin,'excel',env);assert.equal(reference.rows[0].state,'reference');assert.equal(reference.rows[0].nextAmount,reference.rows[0].currentAmount);
 const unchanged=await sync.preview(report({worked:20,absent:0}),service,admin,'excel',env);assert.equal(unchanged.rows[0].state,'unchanged');
}));

test('la actualización guarda el recargo ASEO, conserva anticipos y no lo repite al releer',async()=>fixture(async service=>{
 const source=report({worked:20,absent:0,aseoExtraDays:2});const p=await sync.preview(source,service,admin,'google',env);assert.equal(p.rows[0].input.aseoExtraDays,2);assert.equal(p.rows[0].changes[0].field,'aseoExtraDays');
 const response=await sync.apply({token:p.token,workers:['demo']},service,admin,env);assert.equal(response.results[0].state,'updated');const saved=await service.store.get('demo_2026-10');assert.equal(saved.data.advance,40000);assert.equal(saved.data.aseoExtraDays,2);assert.equal(saved.snapshot.result.aseoExtraPay,90000);
 const again=await sync.preview(source,service,admin,'google',env);assert.equal(again.rows[0].state,'unchanged');
}));
