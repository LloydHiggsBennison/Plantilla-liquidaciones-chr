const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
require('./prepare-static.cjs');
const root=path.resolve(__dirname,'..','dist'),port=Number(process.env.PORT||5173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT inválido');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let target=path.resolve(root,'.'+pathname);
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const stat=await fs.promises.stat(target);if(stat.isDirectory())target=path.join(target,'index.html');
  const bytes=await fs.promises.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end('No encontrado');}
}).listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
