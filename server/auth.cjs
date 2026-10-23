const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const lifetime=8*60*60;
function configured(env=process.env){return !!env.AUTH_USERNAME&&/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(env.AUTH_PASSWORD_HASH||'')&&Buffer.byteLength(env.AUTH_SESSION_SECRET||'')>=32;}
function equal(a,b){const x=crypto.createHash('sha256').update(a).digest(),y=crypto.createHash('sha256').update(b).digest();return crypto.timingSafeEqual(x,y);}
async function verifyCredentials(username,password,env=process.env){
 if(!configured(env)||typeof username!=='string'||typeof password!=='string'||password.length>256)return false;
 const [,salt,expected]=env.AUTH_PASSWORD_HASH.split('$');
 const actual=(await scrypt(password,salt,64)).toString('hex');
 return equal(actual,expected)&&equal(username,env.AUTH_USERNAME);
}
function sign(value,secret){return crypto.createHmac('sha256',secret).update(value).digest('base64url');}
function issue(env=process.env,now=Date.now()){
 const body=Buffer.from(JSON.stringify({exp:Math.floor(now/1000)+lifetime,nonce:crypto.randomBytes(24).toString('base64url')})).toString('base64url');
 return body+'.'+sign(body,env.AUTH_SESSION_SECRET);
}
function valid(token,env=process.env,now=Date.now()){
 if(!configured(env)||typeof token!=='string'||token.length>1024)return false;
 const parts=token.split('.');if(parts.length!==2||!equal(sign(parts[0],env.AUTH_SESSION_SECRET),parts[1]))return false;
 try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());return typeof p.nonce==='string'&&Number.isInteger(p.exp)&&p.exp>Math.floor(now/1000)&&p.exp<=Math.floor(now/1000)+lifetime;}catch{return false;}
}
function cookie(req,token,clear=false){const secure=process.env.VERCEL||req.socket?.encrypted;return 'chr_session='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(clear?0:lifetime)+(secure?'; Secure':'');}
function session(req){const matches=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('chr_session='));return matches.length===1?matches[0].slice(12):'';}
function csrfCookie(req){const matches=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('chr_csrf='));return matches.length===1?matches[0].slice(9):'';}
function csrfToken(){const value=crypto.randomBytes(32).toString('hex');return value+'.'+sign('csrf:'+value,process.env.AUTH_SESSION_SECRET);}
function validCsrf(token){if(typeof token!=='string'||!/^([a-f0-9]{64})\.[A-Za-z0-9_-]{43}$/.test(token))return false;const [v,s]=token.split('.');return equal(s,sign('csrf:'+v,process.env.AUTH_SESSION_SECRET));}
function csrfHeader(req,token){return 'chr_csrf='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600'+(process.env.VERCEL||req.socket?.encrypted?'; Secure':'');}
module.exports={configured,verifyCredentials,issue,valid,cookie,session,lifetime,equal,csrfCookie,csrfToken,validCsrf,csrfHeader};
