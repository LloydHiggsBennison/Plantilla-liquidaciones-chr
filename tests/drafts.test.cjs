const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {LocalStore,PostgresStore}=require('../server/draft-store.cjs'),{DraftService}=require('../server/drafts.cjs'),{calculate}=require('../dist/calculator.js');
const rules=require('../dist/payroll-rules.js');
const w={id:'test-worker',name:'Persona de prueba',role:'Pruebas',base:900000,salaryBasis:'month',employmentType:'employee',pending:[],allowances:[]};
const payroll={WORKERS:[w],Payroll:{calculate:(d,worker)=>calculate(d,worker,{rules,pensionData:{[w.id]:{afp:'Prueba',afpRate:.1,health:'Fonasa',healthRate:.07,afcRate:.006,apv:0}}})}};
const admin={role:'admin',username:'admin-test'},committee={role:'committee',username:'committee-test'};
const input={worker:w.id,period:'2026-10',worked:30,absent:0,advance:0,expectedRevision:0};
async function workflow(store){
 const service=new DraftService(store,payroll);
 await assert.rejects(()=>service.save(input,committee),e=>e.status===403);
 let draft=await service.save(input,admin);assert.equal(draft.status,'pending');assert.equal(draft.revision,1);const amount=draft.snapshot.result.transfer;
 const review=await service.list('2026-10');assert.equal(review.length,1);assert.equal(review[0].snapshot.result.transfer,amount);
 await assert.rejects(()=>service.markTransferred(draft.id,{expectedRevision:1},admin),e=>e.status===403);
 const revised=await service.save({...input,advance:50000,expectedRevision:1},admin);assert.equal(revised.revision,2);assert.equal(revised.snapshot.result.transfer,amount-50000);
 await assert.rejects(()=>service.markTransferred(draft.id,{expectedRevision:1},committee),e=>e.status===409);
 const paid=await service.markTransferred(draft.id,{expectedRevision:2,reference:'TEST-001'},committee);assert.equal(paid.status,'transferred');assert.equal(paid.transferredBy,committee.username);assert.equal(paid.reference,'TEST-001');assert.equal(paid.snapshot.result.transfer,amount-50000);assert.equal(paid.audit.length,3);
 const duplicate=await service.markTransferred(draft.id,{expectedRevision:2,reference:'OTRA'},committee);assert.equal(duplicate.revision,paid.revision);assert.equal(duplicate.reference,'TEST-001');
 await assert.rejects(()=>service.save({...input,advance:1,expectedRevision:3},admin),e=>e.status===423);
 const unfinished=await service.save({...input,period:'2026-09',worked:0},admin);assert.equal(unfinished.status,'draft');await assert.rejects(()=>service.markTransferred(unfinished.id,{expectedRevision:1},committee),e=>e.status===422);
 const nextInput={...input,period:'2026-09',worked:20,absent:0,expectedRevision:1};
 const race=await Promise.allSettled([service.save(nextInput,admin),service.save({...nextInput,advance:10000},admin)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected')[0].reason.status,409);
 const pending=(await service.list('2026-09'))[0];
 const paymentRace=await Promise.allSettled([service.save({...nextInput,expectedRevision:pending.revision,advance:20000},admin),service.markTransferred(pending.id,{expectedRevision:pending.revision},committee)]);
 assert.equal(paymentRace.filter(x=>x.status==='fulfilled').length,1);assert.equal(paymentRace.filter(x=>x.status==='rejected').length,1);
}
test('guardado local persistente y control de versiones entre perfiles',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nomina-drafts-test-')),file=path.join(dir,'drafts.json');
 try{await workflow(new LocalStore(file));const reopened=new LocalStore(file);assert.equal((await reopened.list()).length,2);assert.equal((await reopened.list('2026-10'))[0].status,'transferred');}finally{assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'nomina-drafts-test-'));await fs.rm(dir,{recursive:true});}
});
test('el SQL de PostgreSQL conserva revisiones, marcas únicas y bloqueos',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();try{const store=new PostgresStore(null,{query:async(sql,params)=>(await db.query(sql,params)).rows});await workflow(store);}finally{await db.close();}
});
test('Vercel nunca usa un archivo local como base compartida',()=>{const old=process.env.VERCEL;process.env.VERCEL='1';try{assert.throws(()=>new LocalStore('test.json'),e=>e.status===503);}finally{if(old===undefined)delete process.env.VERCEL;else process.env.VERCEL=old;}});
