const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),vendor=path.join(root,'dist','vendor');
fs.mkdirSync(vendor,{recursive:true});
fs.copyFileSync(path.join(root,'node_modules','jspdf','dist','jspdf.umd.min.js'),path.join(vendor,'jspdf.umd.min.js'));
fs.copyFileSync(path.join(root,'node_modules','jspdf','LICENSE'),path.join(vendor,'jspdf-LICENSE.txt'));
