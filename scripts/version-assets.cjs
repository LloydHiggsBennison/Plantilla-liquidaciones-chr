const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..','dist'),file=path.join(root,'index.html');
const html=fs.readFileSync(file,'utf8').replace(/(src|href)="([^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g,(match,attr,name)=>{
 const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)||!fs.existsSync(target))return match;
 const hash=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0,12);return attr+'="'+name+'?v='+hash+'"';
});fs.writeFileSync(file,html);
