const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fromGoogle,SOURCE_ID}=require('../server/attendance.cjs');

test('Google usa cuenta de servicio de solo lectura y conserva colores, notas y fechas',async()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const env={GOOGLE_SERVICE_ACCOUNT_EMAIL:'reader@example.test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}).replace(/\n/g,'\\n')};
 let calls=0;
 const sheets=await fromGoogle(env,async(url,options)=>{
  calls++;
  if(calls===1){assert.equal(url,'https://oauth2.googleapis.com/token');const assertion=options.body.get('assertion'),[head,body,signature]=assertion.split('.'),claims=JSON.parse(Buffer.from(body,'base64url'));assert.equal(claims.iss,env.GOOGLE_SERVICE_ACCOUNT_EMAIL);assert.equal(claims.scope,'https://www.googleapis.com/auth/spreadsheets.readonly');assert(crypto.verify('RSA-SHA256',Buffer.from(head+'.'+body),publicKey,Buffer.from(signature,'base64url')));return {ok:true,json:async()=>({access_token:'test-token'})};}
  const request=new URL(url);assert(request.pathname.endsWith('/'+SOURCE_ID));assert.deepEqual(request.searchParams.getAll('ranges'),["'Turnos'!A1:K3000","'Nocheros'!A1:K3000","'ASEO'!A1:K3000"]);assert.equal(options.headers.Authorization,'Bearer test-token');
  return {ok:true,json:async()=>({sheets:[{properties:{title:'Nocheros'},data:[{startRow:2,startColumn:1,rowData:[{values:[{effectiveValue:{numberValue:46318},formattedValue:'23/10/2026'},{effectiveValue:{stringValue:'L.ALCAINO'},effectiveFormat:{backgroundColor:{red:1}},note:'Ausente'}]}]}]}]})};
 });
 assert.equal(calls,2);assert.equal(sheets[0].rows[0].index,3);assert.equal(sheets[0].rows[0].cells[2].value,46318);assert.equal(sheets[0].rows[0].cells[3].color,'FF0000');assert.equal(sheets[0].rows[0].cells[3].note,'Ausente');assert.equal(sheets[0].rows[0].cells[3].ref,'C3');
});

test('Google sin credenciales falla de forma explícita y no hace solicitudes',async()=>{
 await assert.rejects(()=>fromGoogle({},()=>{throw Error('No debe consultar');}),e=>e.status===503&&e.message.includes('cuenta de servicio'));
});
