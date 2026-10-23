const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const name of ['workers','pension-data']){
 const target=path.join(root,'dist',name+'.js');
 if(!fs.existsSync(target))fs.copyFileSync(path.join(root,'dist',name+'.example.js'),target);
}
