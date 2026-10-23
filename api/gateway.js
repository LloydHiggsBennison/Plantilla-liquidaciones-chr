const fs=require('node:fs/promises'),path=require('node:path');
const auth=require('../server/auth.cjs'),login=require('../server/login.cjs');
const root=path.resolve(__dirname,'..','private-dist');
const attempts=new Map();
const assets=new Set(['index.html','styles.css','app.js','calculator.js','pdf.js','profiles.js','workers.js','pension-data.js','payroll-rules.js','vendor/jspdf.umd.min.js']);
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
async function handler(req,res,assetRoot){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 if(!auth.configured())return send(res,503,'Acceso no configurado. Configura las variables privadas de autenticación en Vercel.');
 const url=new URL(req.url,'http://localhost');let resource;
 try{resource=decodeURIComponent(String(req.query?.asset??url.searchParams.get('asset')??url.pathname.replace(/^\//,'')));}catch{return send(res,400,'Ruta inválida.');}
 if(!['GET','HEAD','POST'].includes(req.method)){res.setHeader('Allow','GET, HEAD, POST');return send(res,405,'Método no permitido.');}
 function csrf(){let token=auth.csrfCookie(req);if(!auth.validCsrf(token)){token=auth.csrfToken();res.setHeader('Set-Cookie',auth.csrfHeader(req,token));}return token;}
 function csrfForm(form){const token=form.get('csrf');return auth.validCsrf(token)&&auth.equal(token,auth.csrfCookie(req));}
 if(resource==='login'){
  if(req.method==='GET'||req.method==='HEAD'){if(auth.valid(auth.session(req)))return redirect(res,'/');return send(res,200,req.method==='HEAD'?'':login('',csrf()));}
  if(!sameOrigin(req))return send(res,403,'Solicitud no permitida.');
  // Límite por instancia; el límite global debe configurarse en Vercel Firewall.
  const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0],now=Date.now();
  for(const [key,value]of attempts)if(now-value.start>900000)attempts.delete(key);
  const current=attempts.get(ip)||{count:0,start:now};if(current.count>=10){res.setHeader('Retry-After','900');return send(res,429,login('Demasiados intentos. Intenta nuevamente en 15 minutos.',csrf()));}
  current.count++;attempts.set(ip,current);
  let form;try{form=await readForm(req);}catch{return send(res,400,login('Revisa los datos ingresados.',csrf()));}
  if(!csrfForm(form))return send(res,403,'Solicitud no permitida.');
  if(!await auth.verifyCredentials(form.get('username'),form.get('password')))return send(res,401,login('Usuario o contraseña incorrectos.',csrf()));
  attempts.delete(ip);res.setHeader('Set-Cookie',auth.cookie(req,auth.issue()));return redirect(res,'/');
 }
 if(!auth.valid(auth.session(req))){if(resource===''||resource==='index.html')return redirect(res,'/login');return send(res,401,'Debes iniciar sesión.','text/plain; charset=utf-8');}
 if(resource==='logout'){
  if(req.method!=='POST'||!sameOrigin(req))return send(res,403,'Solicitud no permitida.');
  let form;try{form=await readForm(req);}catch{return send(res,400,'Solicitud inválida.');}if(!csrfForm(form))return send(res,403,'Solicitud no permitida.');
  res.setHeader('Set-Cookie',auth.cookie(req,'',true));return redirect(res,'/login');
 }
 if(!['GET','HEAD'].includes(req.method))return send(res,405,'Método no permitido.');
 resource=resource||'index.html';if(!assets.has(resource))return send(res,404,'No encontrado.');
 try{
  let data=await fs.readFile(path.join(assetRoot,resource));
  if(resource==='index.html')data=Buffer.from(data.toString().replace('</header>','<form method="post" action="/logout"><input type="hidden" name="csrf" value="'+csrf()+'"><button class="button outline" type="submit">Cerrar sesión</button></form></header>'));
  return send(res,200,req.method==='HEAD'?'':data,types[path.extname(resource)]||'application/octet-stream');
 }catch{return send(res,503,'No se pudo cargar la aplicación.');}
}
module.exports=(req,res)=>handler(req,res,root);
module.exports.createHandler=assetRoot=>(req,res)=>handler(req,res,path.resolve(assetRoot));
