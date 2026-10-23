const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http');
const auth=require('../server/auth.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const salt='0123456789abcdef0123456789abcdef';
const env={AUTH_USERNAME:'test-admin',AUTH_PASSWORD_HASH:'scrypt$'+salt+'$'+crypto.scryptSync('test-pass',salt,64).toString('hex'),AUTH_SESSION_SECRET:'a'.repeat(64),AUTH_COMMITTEE_USERNAME:'committee-test',AUTH_COMMITTEE_PASSWORD_HASH:'scrypt$'+salt+'$'+crypto.scryptSync('committee-pass',salt,64).toString('hex')};
test('el rol procede de las credenciales y no se puede alterar en la prueba de pestaña',async()=>{const identity=await auth.authenticate('committee-test','committee-pass',env);assert.equal(identity.role,'committee');const browser=auth.issue(env),tab=auth.issueTab(browser,env,identity);assert.equal(auth.tabIdentity(tab,browser,env).role,'committee');const [body,sig]=tab.split('.'),payload=JSON.parse(Buffer.from(body,'base64url'));payload.role='admin';payload.username=env.AUTH_USERNAME;const forged=Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+sig;assert(!auth.validTab(forged,browser,env));});
test('credenciales correctas, incorrectas y configuración incompleta',async()=>{assert(await auth.verifyCredentials('test-admin','test-pass',env));assert(!await auth.verifyCredentials('otro','test-pass',env));assert(!await auth.verifyCredentials('test-admin','incorrecta',env));assert(!auth.configured({}));});
test('sesión sin vencimiento y prueba de pestaña vinculada al navegador',()=>{const token=auth.issue(env),tab=auth.issueTab(token,env);assert(auth.valid(token,env));assert(!JSON.parse(Buffer.from(token.split('.')[0],'base64url')).exp);assert(!auth.valid(token+'x',env));assert(!auth.valid(token,{...env,AUTH_SESSION_SECRET:'b'.repeat(64)}));assert(auth.validTab(tab,token,env));assert(!auth.validTab(tab,auth.issue(env),env));assert(!auth.validTab(tab+'x',token,env));const cookie=auth.cookie({socket:{}},token);assert(!/Max-Age|Expires/i.test(cookie));});
test('flujo HTTP protege datos, rechaza CSRF y cierra sesión',async()=>{
 const previous={};for(const k of Object.keys(env)){previous[k]=process.env[k];process.env[k]=env[k];}
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'nomina-auth-test-'));
 fs.writeFileSync(path.join(fixture,'workers.js'),'window.WORKERS=[];');fs.writeFileSync(path.join(fixture,'index.html'),'<html><header></header></html>');
 const handler=require('../api/gateway.js').createHandler(fixture);
 const server=http.createServer((req,res)=>handler(req,res).catch(()=>{res.statusCode=500;res.end();}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(url,options={})=>fetch(base+url,{redirect:'manual',...options});
 try{
  let r=await request('/');assert.equal(r.status,200);assert((await r.text()).includes('Iniciar sesión'));
  for(const file of ['/workers.js','/pension-data.js','/private-dist/workers.js','/api/gateway?asset=workers.js','/workers.js?v=1'])assert.equal((await request(file)).status,401);
  r=await request('/login');assert.equal(r.status,200);const html=await r.text(),csrf=html.match(/name="csrf" value="([^"]+)"/)[1],csrfCookie=r.headers.get('set-cookie').split(';')[0];assert(html.includes('Iniciar sesión'));assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');
  const post=(body,origin=base)=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,Cookie:csrfCookie},body:body+'&csrf='+encodeURIComponent(csrf)});
  assert.equal((await request('/login',post('username=test-admin&password=test-pass','https://otro.test'))).status,403);
  assert.equal((await request('/login',post('username=test-admin&password=incorrecta'))).status,401);
  r=await request('/login',post('username=test-admin&password=test-pass'));assert.equal(r.status,200);const {tab}=await r.json(),prefix='/s/'+tab;const cookie=r.headers.get('set-cookie');assert(cookie.includes('HttpOnly'));assert(cookie.includes('SameSite=Strict'));
  const headers={Cookie:cookie.split(';')[0]+'; '+csrfCookie};
  const mutate={method:'POST',headers:{...headers,Origin:base,'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({expectedRevision:1})};
  assert.equal((await request(prefix+'/api/drafts/test_2026-10/transfer',mutate)).status,403);
  const committeeResponse=await request('/login',post('username=committee-test&password=committee-pass'));assert.equal(committeeResponse.status,200);const committeeTab=(await committeeResponse.json()).tab,committeeCookie=committeeResponse.headers.get('set-cookie').split(';')[0];
  const forbidden=await request('/s/'+committeeTab+'/api/drafts',{...mutate,headers:{...mutate.headers,Cookie:committeeCookie+'; '+csrfCookie}});assert.equal(forbidden.status,403);
  assert.equal((await request('/workers.js',{headers})).status,401);assert.equal((await request('/session-check',{headers})).status,401);assert.equal((await request('/session-check',{headers:{...headers,'X-CHR-Tab':tab}})).status,204);r=await request(prefix+'/workers.js',{headers});assert.equal(r.status,200);assert((await r.text()).includes('WORKERS'));assert.equal(r.headers.get('cdn-cache-control'),'no-store');
  assert.equal((await request(prefix+'/unknown',{headers})).status,404);
  r=await request('/',{headers});assert((await r.text()).includes('Iniciar sesión'));r=await request(prefix+'/index.html',{headers});assert((await r.text()).includes('Cerrar sesión'));
  assert.equal((await request(prefix+'/logout',{method:'POST',headers})).status,400);
  r=await request(prefix+'/logout',{method:'POST',headers:{...headers,Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:'csrf='+encodeURIComponent(csrf)});assert.equal(r.status,303);assert(r.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal((await request(prefix+'/workers.js')).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));for(const k of Object.keys(env)){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}assert(path.resolve(fixture).startsWith(path.resolve(os.tmpdir())+path.sep+'nomina-auth-test-'));fs.rmSync(fixture,{recursive:true});}
});
