// Solo se conserva la prueba de acceso en la pestaña; nunca la contraseña.
const tabStorage='chr-tab-session-v2';
const form=document.querySelector('form');
const card=document.querySelector('.card');
const loading=document.getElementById('session-loading');
function showLogin(){loading.hidden=true;card.hidden=false;}
function error(message){let node=document.getElementById('login-error');if(!node){node=document.createElement('p');node.id='login-error';node.className='error';node.setAttribute('role','alert');form.before(node);}node.textContent=message;}
function forget(){try{sessionStorage.removeItem(tabStorage);}catch{}}
function openApp(token){
 const frame=document.createElement('iframe');frame.title='Remuneraciones';frame.src='/s/'+encodeURIComponent(token)+'/index.html';frame.style.cssText='position:fixed;inset:0;border:0;width:100%;height:100%;background:#f6f8f5';
 card.hidden=true;loading.hidden=false;frame.hidden=true;
 frame.addEventListener('load',()=>{loading.hidden=true;frame.hidden=false;},{once:true});
 document.body.append(frame);
}
async function restore(){
 if(location.pathname==='/signed-out'){forget();history.replaceState(null,'','/');showLogin();return;}
 let token;try{token=sessionStorage.getItem(tabStorage);}catch{showLogin();return;}
 if(!token){showLogin();return;}
 try{const response=await fetch('/session-check',{headers:{'X-CHR-Tab':token},cache:'no-store',credentials:'same-origin'});if(response.ok){openApp(token);return;}forget();}catch{error('No se pudo recuperar el acceso. Intenta nuevamente.');}
 showLogin();
}
form.addEventListener('submit',async event=>{
 event.preventDefault();const button=form.querySelector('button');button.disabled=true;
 try{
  const body=new URLSearchParams(new FormData(form));
  const response=await fetch('/login',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body,credentials:'same-origin',cache:'no-store'});
  if(!response.ok){error(response.status===429?'Demasiados intentos. Intenta nuevamente en 15 minutos.':'Usuario o contraseña incorrectos.');return;}
  const data=await response.json();
  try{sessionStorage.setItem(tabStorage,data.tab);}catch{error('Habilita el almacenamiento de esta pestaña para iniciar sesión.');return;}
  form.reset();history.replaceState(null,'','/');openApp(data.tab);
 }catch{error('No se pudo conectar. Intenta nuevamente.');}finally{button.disabled=false;}
});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
restore();
