const http=require('node:http');const handler=require('../api/gateway.js');
http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(()=>{res.statusCode=500;res.end('Error interno.');})).listen(Number(process.env.PORT||5175),'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+(process.env.PORT||5175)));
