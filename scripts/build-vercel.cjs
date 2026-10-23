const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
require('./prepare-static.cjs');
const dest=path.join(root,'private-dist');fs.mkdirSync(dest,{recursive:true});
const names=['index.html','styles.css','app.js','calculator.js','pdf.js','profiles.js','workers.js','pension-data.js','payroll-rules.js'];
for(const name of names)fs.copyFileSync(path.join(root,'dist',name),path.join(dest,name));
fs.mkdirSync(path.join(dest,'vendor'),{recursive:true});fs.copyFileSync(path.join(root,'dist/vendor/jspdf.umd.min.js'),path.join(dest,'vendor/jspdf.umd.min.js'));
const encrypted=path.join(root,'config/payroll.enc.json');
if(fs.existsSync(encrypted)){
 const key=Buffer.from(process.env.PAYROLL_DATA_KEY||'','base64');if(key.length!==32)throw Error('Configura PAYROLL_DATA_KEY en Vercel antes del build.');
 const payload=JSON.parse(fs.readFileSync(encrypted,'utf8'));
 const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(payload.iv,'base64'));cipher.setAuthTag(Buffer.from(payload.tag,'base64'));
 const files=JSON.parse(Buffer.concat([cipher.update(Buffer.from(payload.data,'base64')),cipher.final()]).toString('utf8'));
 for(const name of ['workers.js','pension-data.js','payroll-rules.js']){if(typeof files[name]!=='string')throw Error('Configuración privada incompleta.');fs.writeFileSync(path.join(dest,name),files[name]);}
}
// Solo se publica este directorio vacío. Todos los datos se sirven a través del login.
fs.mkdirSync(path.join(root,'public'),{recursive:true});fs.writeFileSync(path.join(root,'public','.keep'),'');
console.log('Aplicación preparada para servir exclusivamente mediante autenticación.');
