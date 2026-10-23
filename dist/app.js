const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n);
const percent=n=>new Intl.NumberFormat('es-CL',{style:'percent',maximumFractionDigits:2}).format(n);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=name=>name.split(' ').slice(0,2).map(s=>s[0]).join('');
const periodLabel=p=>/^\d{4}-(0[1-9]|1[0-2])$/.test(p)?new Date(Number(p.slice(0,4)),Number(p.slice(5,7))-1,1).toLocaleDateString('es-CL',{month:'long',year:'numeric'}):'Selecciona un período';
const STORAGE='nomina-simple-drafts-v1';let drafts={},legacyDrafts={},viewRecord=null,loadedRevision=0,storageReady=false;
const profile=window.SessionProfile||{role:'committee',username:'',csrf:''},committee=profile.role==='committee';
try{const stored=JSON.parse(localStorage.getItem(STORAGE)||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))legacyDrafts=stored;}catch{}
const current=()=>WORKERS.find(w=>w.id===$('worker').value)||WORKERS[0];
function read(){const d={worker:current().id,period:$('period').value};for(const k of Payroll.fields)d[k]=$(k).value;return d;}
function showErrors(errors){$('errors').hidden=!errors.length;$('errors').textContent=errors.join(' ');if(errors.length)$('errors').scrollIntoView({behavior:'smooth',block:'center'});}
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function rows(items){return items.map(a=>'<div class="row"><span>'+escapeHtml(a.label)+(a.note?'<small class="basis-note">'+escapeHtml(a.note)+'</small>':'')+'</span><strong>'+money(a.amount)+'</strong></div>').join('');}
function update(){
 const snapshot=viewRecord&&(committee||viewRecord.status==='transferred')?viewRecord.snapshot:null;
 const d=snapshot?.data||read(),w=snapshot?.worker||current(),r=snapshot?.result||Payroll.calculate(d,w),p=r.insurance||PensionData[w.id],isHonorarios=w.employmentType==='honorarios';
 $('worker-name').textContent=$('preview-name').textContent=w.name;$('worker-role').textContent=$('preview-role').textContent=w.role;$('worker-initials').textContent=initials(w.name);$('preview-period').textContent=periodLabel(d.period);
 for(const k of ['worked','absent'])$('preview-'+k).textContent=d[k]||'0';
 $('salary-summary').textContent=isHonorarios?'Honorarios brutos por día: '+money(w.dailyRate):w.salaryBasis==='day'?'Sueldo base por día: '+money(w.dailyRate):'Sueldo base mensual: '+money(w.base);
 $('pension-summary').textContent=isHonorarios?'Honorarios. El prestador paga sus impuestos; el condominio no retiene ni descuenta AFP, salud o cesantía en esta transferencia.':p?'AFP: '+p.afp+' ('+percent(p.afpRate)+'). Salud: '+p.health+' ('+percent(p.healthRate)+'). Cesantía: '+(typeof p.afcRate==='number'?percent(p.afcRate):'pendiente')+'.'+(p.apv?' APV: '+money(p.apv)+'.':''):'Datos previsionales pendientes.';
 $('slip-heading').textContent=isHonorarios?'Resumen de honorarios':'Liquidación de sueldo';$('slip-status').textContent=r.ready?'CÁLCULO COMPLETO':'BORRADOR · DATOS PENDIENTES';$('slip-status').classList.toggle('ready',r.ready);
 $('pay-earnings').innerHTML=rows(r.incomeRows);$('pay-deductions').innerHTML=rows(r.deductionRows);$('pay-adjustments').innerHTML=rows(r.adjustments);$('adjustments-section').hidden=!r.adjustments.length;
 $('pay-imponible').textContent=isHonorarios?'No aplica':money(r.totalTaxable);$('pay-non-imponible').textContent=isHonorarios?'No aplica':money(r.nonTaxable);$('pay-gross').textContent=money(r.gross);$('pay-total-deductions').textContent=money(r.totalDeductions);$('pay-net').textContent=r.ready?money(r.transfer):'Pendiente';
 const issues=[...r.errors,...r.pending];$('calculation-status').hidden=!issues.length;$('calculation-status').textContent=issues.join(' ');
 $('download-pdf').textContent=r.ready?(isHonorarios?'↓ Descargar resumen de honorarios':'↓ Descargar liquidación PDF'):'↓ Descargar borrador PDF';
 $('period-count').textContent=Object.values(drafts).filter(x=>x.period===d.period).length;
}
