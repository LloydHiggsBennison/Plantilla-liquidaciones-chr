const fs=require('node:fs/promises'),path=require('node:path');
class StoreError extends Error{constructor(status,message){super(message);this.status=status;}}
const queues=new Map();
class LocalStore{
 constructor(file){if(process.env.VERCEL)throw new StoreError(503,'Configura DATABASE_URL para el guardado compartido.');this.file=path.resolve(file);}
 async all(){try{return JSON.parse(await fs.readFile(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
 async list(period){return Object.values(await this.all()).filter(x=>!period||x.period===period);}
 async get(id){return (await this.all())[id]||null;}
 async compareAndSet(record,expected){
  const previous=queues.get(this.file)||Promise.resolve();let release;const next=new Promise(resolve=>release=resolve);queues.set(this.file,next);await previous;
  try{const all=await this.all(),current=all[record.id];if((current?.revision||0)!==expected)return null;all[record.id]=record;await fs.mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';await fs.writeFile(temp,JSON.stringify(all),'utf8');await fs.rename(temp,this.file);return record;}finally{release();if(queues.get(this.file)===next)queues.delete(this.file);}
 }
}
class PostgresStore{
 constructor(url,queryClient){if(queryClient)this.sql=queryClient;else{const {neon}=require('@neondatabase/serverless');this.sql=neon(url);}this.ready=null;}
 async init(){if(!this.ready)this.ready=this.sql.query('CREATE TABLE IF NOT EXISTS chr_payroll_drafts (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, document JSONB NOT NULL)').catch(e=>{this.ready=null;throw e;});await this.ready;}
 async list(period){await this.init();const rows=await this.sql.query('SELECT document FROM chr_payroll_drafts WHERE ($1::text IS NULL OR document->>\'period\' = $1) ORDER BY id',[period||null]);return rows.map(x=>x.document);}
 async get(id){await this.init();const rows=await this.sql.query('SELECT document FROM chr_payroll_drafts WHERE id = $1',[id]);return rows[0]?.document||null;}
 async compareAndSet(record,expected){
  await this.init();
  const rows=await this.sql.query(`INSERT INTO chr_payroll_drafts(id,revision,document)
   SELECT $1,$2,$3::jsonb WHERE $4::integer=0 OR EXISTS(SELECT 1 FROM chr_payroll_drafts WHERE id=$1 AND revision=$4)
   ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,document=EXCLUDED.document
   WHERE chr_payroll_drafts.revision=$4 RETURNING document`,[record.id,record.revision,JSON.stringify(record),expected]);
  return rows[0]?.document||null;
 }
}
let shared;
function getStore(){if(shared)return shared;if(process.env.DATABASE_URL)return shared=new PostgresStore(process.env.DATABASE_URL);if(process.env.DRAFTS_LOCAL_FILE&&!process.env.VERCEL)return shared=new LocalStore(process.env.DRAFTS_LOCAL_FILE);throw new StoreError(503,'El guardado compartido necesita una base de datos. Configura DATABASE_URL en Vercel.');}
module.exports={getStore,LocalStore,PostgresStore,StoreError};
