const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const script=fs.readFileSync(require.resolve('../server/session-client.js'),'utf8');
function page(token,check){
 const card={hidden:true},loading={hidden:false},frames=[],events={};
 const form={addEventListener(){}};
 const document={querySelector:s=>s==='form'?form:card,getElementById:()=>loading,createElement:()=>({style:{},addEventListener:(name,fn)=>{events[name]=fn;}}),body:{append:frame=>frames.push(frame)}};
 vm.runInNewContext(script,{document,sessionStorage:{getItem:()=>token,removeItem(){}},location:{pathname:'/'},window:{addEventListener(){}},fetch:check,encodeURIComponent});
 return {card,loading,frames,events};
}
test('la sesión válida mantiene oculto el login hasta cargar la aplicación',async()=>{
 let resolve;const check=new Promise(r=>{resolve=r;});const p=page('saved-token',()=>check);
 assert.equal(p.card.hidden,true);assert.equal(p.loading.hidden,false);assert.equal(p.frames.length,0);
 resolve({ok:true});await new Promise(setImmediate);
 assert.equal(p.card.hidden,true);assert.equal(p.frames.length,1);assert.equal(p.frames[0].hidden,true);
 p.events.load();assert.equal(p.frames[0].hidden,false);assert.equal(p.loading.hidden,true);assert.equal(p.card.hidden,true);
});
test('sin sesión o con sesión rechazada se muestra el formulario',async()=>{
 const fresh=page(null,()=>{throw Error('No debe consultar');});assert.equal(fresh.card.hidden,false);assert.equal(fresh.loading.hidden,true);
 const expired=page('invalid',async()=>({ok:false}));await new Promise(setImmediate);assert.equal(expired.card.hidden,false);assert.equal(expired.loading.hidden,true);assert.equal(expired.frames.length,0);
});
