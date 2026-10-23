const fs=require('node:fs/promises'),path=require('node:path');
const auth=require('../server/auth.cjs'),login=require('../server/login.cjs');
const {DraftService,loadPayroll}=require('../server/drafts.cjs');
const {getStore}=require('../server/draft-store.cjs');
const serviceCache=new Map();
const root=path.resolve(__dirname,'..','private-dist');
const attempts=new Map();
const assets=new Set(['index.html','styles.css','app.js','shared-ui.js','attendance-ui.js','calculator.js','pdf.js','profiles.js','workers.js','pension-data.js','payroll-rules.js','vendor/jspdf.umd.min.js']);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
function send(res,status,body,type='text/html; charset=utf-8'){res.statusCode=status;res.setHeader('Content-Type',type);res.end(body);}
function redirect(res,to){res.statusCode=303;res.setHeader('Location',to);res.end();}
function sameOrigin(req){if(!req.headers.origin||req.headers.origin==='null')return true;try{const origin=new URL(req.headers.origin);return origin.host===req.headers.host&&['http:','https:'].includes(origin.protocol);}catch{return false;}}
async function readForm(req){
 if(!(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))throw Error('type');
 if(typeof req.body==='string'){if(Buffer.byteLength(req.body)>4096)throw Error('size');return new URLSearchParams(req.body);}
 if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)){const data=new URLSearchParams();for(const [k,v]of Object.entries(req.body)){if(typeof v!=='string'||v.length>1024)throw Error('size');data.set(k,v);}return data;}
 let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('size');chunks.push(chunk);}return new URLSearchParams(Buffer.concat(chunks).toString());
}
async function readJson(req,limit=8192){
 if(!(req.headers['content-type']||'').startsWith('application/json'))throw Error('type');
 if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)){if(JSON.stringify(req.body).length>limit)throw Error('size');return req.body;}
 let body=req.body;if(typeof body!=='string'){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('size');chunks.push(chunk);}body=Buffer.concat(chunks).toString();}
 if(body.length>limit)throw Error('size');const value=JSON.parse(body);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('json');return value;
}
async function handler(req,res,assetRoot,dependencies={}){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
 if(!auth.configured())return send(res,503,'Acceso no configurado. Configura las variables privadas de autenticación en Vercel.');
 const url=new URL(req.url,'http://localhost');let resource;
 try{resource=decodeURIComponent(String(req.query?.asset??url.searchParams.get('asset')??url.pathname.replace(/^\//,'')));}catch{return send(res,400,'Ruta inválida.');}
 if(!['GET','HEAD','POST'].includes(req.method)){res.setHeader('Allow','GET, HEAD, POST');return send(res,405,'Método no permitido.');}
 function csrf(){let token=auth.csrfCookie(req);if(!auth.validCsrf(token)){token=auth.csrfToken();res.setHeader('Set-Cookie',auth.csrfHeader(req,token));}return token;}
 function csrfForm(form){const token=form.get('csrf');return auth.validCsrf(token)&&auth.equal(token,auth.csrfCookie(req));}
 function renderLogin(error=''){return login(error,csrf()).replace('</body>','<script src="/session-client.js" defer></script></body>');}
 if(resource==='session-client.js'&&req.method==='GET')return send(res,200,await fs.readFile(path.join(__dirname,'../server/session-client.js')),types['.js']);
 if(['','index.html','login','signed-out'].includes(resource)&&['GET','HEAD'].includes(req.method))return send(res,200,req.method==='HEAD'?'':renderLogin());
 const browser=auth.session(req),match=resource.match(/^s\/([-\w.]+)\/(.*)$/),tab=match?.[1]||req.headers['x-chr-tab'];
 if(resource==='session-check'&&req.method==='GET')return send(res,auth.validTab(tab,browser)?204:401,'','text/plain');
 if(resource==='login'){
  if(!sameOrigin(req))return send(res,403,'Solicitud no permitida.');
  // Límite por instancia; el límite global debe configurarse en Vercel Firewall.
  const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0],now=Date.now();
  for(const [key,value]of attempts)if(now-value.start>900000)attempts.delete(key);
  const current=attempts.get(ip)||{count:0,start:now};if(current.count>=10){res.setHeader('Retry-After','900');return send(res,429,login('Demasiados intentos. Intenta nuevamente en 15 minutos.',csrf()));}
  current.count++;attempts.set(ip,current);
  let form;try{form=await readForm(req);}catch{return send(res,400,login('Revisa los datos ingresados.',csrf()));}
  if(!csrfForm(form))return send(res,403,'Solicitud no permitida.');
  const identity=await auth.authenticate(form.get('username'),form.get('password'));if(!identity)return send(res,401,login('Usuario o contraseña incorrectos.',csrf()));
  attempts.delete(ip);const browserToken=auth.valid(browser)?browser:auth.issue();res.setHeader('Set-Cookie',auth.cookie(req,browserToken));return send(res,200,JSON.stringify({tab:auth.issueTab(browserToken,process.env,identity)}),'application/json');
 }
 if(!match||!auth.validTab(tab,browser))return send(res,401,'Debes iniciar sesión.','text/plain; charset=utf-8');
 resource=match[2];
 const identity=auth.tabIdentity(tab,browser);
 if(resource==='session-profile.js'&&req.method==='GET')return send(res,200,'window.SessionProfile='+JSON.stringify({...identity,csrf:csrf()})+';',types['.js']);
 if(resource.startsWith('api/')){
  const json=(status,value)=>send(res,status,JSON.stringify(value),'application/json; charset=utf-8');
  try{
   let input;
   if(resource.startsWith('api/attendance')&&identity.role!=='admin')return json(403,{error:'Solo administración puede actualizar desde la planilla.'});
   const draftService=()=>{let service=dependencies.service||serviceCache.get(assetRoot);if(!service){service=new DraftService(getStore(),loadPayroll(assetRoot));serviceCache.set(assetRoot,service);}return service;};
   if(resource==='api/attendance/connection'&&req.method==='GET')return json(200,{configured:Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)});
   if(req.method==='POST'){
    if(!sameOrigin(req)||!auth.validCsrf(req.headers['x-csrf-token'])||!auth.equal(req.headers['x-csrf-token'],auth.csrfCookie(req)))return json(403,{error:'Solicitud no permitida.'});
    try{input=await readJson(req,['api/attendance','api/attendance/preview'].includes(resource)?3*1024*1024:resource==='api/attendance/apply'?128*1024:8192);}catch{return json(400,{error:'Datos de solicitud inválidos o archivo demasiado grande.'});}
    if(resource==='api/drafts'&&identity.role!=='admin')return json(403,{error:'El comité no puede editar los borradores.'});
    if(resource.endsWith('/transfer')&&identity.role!=='committee')return json(403,{error:'Solo el comité puede registrar transferencias.'});
   }
   if(resource==='api/attendance/apply'&&req.method==='POST')return json(200,await require('../server/attendance-sync.cjs').apply(input,draftService(),identity));
   if(['api/attendance','api/attendance/preview'].includes(resource)&&['GET','POST'].includes(req.method)){
    if(identity.role!=='admin')return json(403,{error:'Solo administración puede leer e importar la planilla.'});
    const attendance=require('../server/attendance.cjs');
    try{
     const period=input?.period||url.searchParams.get('period')||req.query?.period;
     if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period||''))return json(400,{error:'Selecciona un período válido.'});
     let sheets;
     if(req.method==='POST'){
      if(typeof input.file!=='string'||!input.file||!/^[A-Za-z0-9+/=]+$/.test(input.file))return json(400,{error:'Selecciona el archivo Excel (.xlsx) descargado desde Google Sheets.'});
      sheets=await attendance.fromXlsx(Buffer.from(input.file,'base64'));
     }else sheets=await attendance.fromGoogle();
     const payroll=loadPayroll(assetRoot);
     const report=attendance.analyze(sheets,period,payroll.WORKERS);
     return json(200,resource==='api/attendance/preview'?await require('../server/attendance-sync.cjs').preview(report,draftService(),identity,req.method==='POST'?'excel':'google'):report);
    }catch(e){return json(e.status||422,{error:e.message||'No se pudo leer la planilla.'});}
   }
   const service=draftService();
   if(resource==='api/drafts'&&req.method==='GET')return json(200,{drafts:await service.list(url.searchParams.get('period')||req.query?.period||null)});
   if(resource==='api/drafts'&&req.method==='POST')return json(200,{draft:await service.save(input,identity)});
   const transfer=resource.match(/^api\/drafts\/([^/]+)\/transfer$/);if(transfer&&req.method==='POST')return json(200,{draft:await service.markTransferred(transfer[1],input,identity)});
   return json(404,{error:'No encontrado.'});
  }catch(e){return json(e.status||503,{error:e.status?e.message:'No se pudo acceder al guardado compartido. Intenta nuevamente.'});}
 }
 if(resource==='logout'){
  if(req.method!=='POST'||!sameOrigin(req))return send(res,403,'Solicitud no permitida.');
  let form;try{form=await readForm(req);}catch{return send(res,400,'Solicitud inválida.');}if(!csrfForm(form))return send(res,403,'Solicitud no permitida.');
  res.setHeader('Set-Cookie',auth.cookie(req,'',true));return redirect(res,'/signed-out');
 }
 if(!['GET','HEAD'].includes(req.method))return send(res,405,'Método no permitido.');
 resource=resource||'index.html';if(!assets.has(resource))return send(res,404,'No encontrado.');
 try{
  let data=await fs.readFile(path.join(assetRoot,resource));
  if(resource==='index.html')data=Buffer.from(data.toString().replace(/(<script defer src="app\.js[^>]*><\/script>)/,'<script defer src="session-profile.js"></script>$1').replace('</header>','<form method="post" target="_top" action="/s/'+tab+'/logout"><input type="hidden" name="csrf" value="'+csrf()+'"><button class="button outline" type="submit">Cerrar sesión</button></form></header>'));
  return send(res,200,req.method==='HEAD'?'':data,types[path.extname(resource)]||'application/octet-stream');
 }catch{return send(res,503,'No se pudo cargar la aplicación.');}
}
module.exports=(req,res)=>handler(req,res,root);
module.exports.createHandler=(assetRoot,dependencies)=>(req,res)=>handler(req,res,path.resolve(assetRoot),dependencies);
