const statusLabel={draft:'Datos pendientes',pending:'Pendiente de transferencia',transferred:'Transferencia realizada'};
const dateLabel=value=>new Date(value).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short',timeZone:'America/Santiago'});
let activeView=committee?'history':'payroll',pendingTransfer=null,refreshing=false,initialSyncComplete=false;
async function api(route,body){
 const response=await fetch(route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':profile.csrf}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'same-origin'});
 let value;try{value=await response.json();}catch{throw new Error(response.status===401?'Tu sesión cambió. Vuelve a iniciar sesión.':'No se pudo conectar con el guardado compartido.');}
 if(!response.ok){const error=new Error(value.error||'No se pudo completar la solicitud.');error.status=response.status;throw error;}return value;
}
function loadRecord(record){
 viewRecord=record||drafts[current().id+'_'+$('period').value]||null;loadedRevision=viewRecord?.revision||0;
 const data=viewRecord?.data;for(const key of Payroll.fields)$(key).value=data?.[key]??'0';
 const readonly=committee||viewRecord?.status==='transferred';for(const key of Payroll.fields)$(key).disabled=readonly||!storageReady;
 $('worker').disabled=committee;$('period').disabled=committee;$('payroll-form').querySelector('[type=submit]').hidden=readonly;$('payroll-form').querySelector('[type=submit]').disabled=!storageReady;
 $('payroll-form').querySelector('.form-footer>span').textContent=readonly?'Registro de solo lectura':'Guardado compartido entre administración y comité';
 $('errors').hidden=true;update();
 if(viewRecord?.status==='transferred'){$('slip-status').textContent='TRANSFERENCIA REGISTRADA';$('slip-status').classList.add('ready');}
}
function navigate(view){
 if(committee&&view==='team')return;activeView=view;
 for(const key of ['payroll','team','history'])$(key+'-view').hidden=key!==view;
 document.querySelectorAll('.nav').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
 $('breadcrumb').textContent={payroll:committee?'Revisión de borrador':'Liquidaciones',team:'Equipo',history:'Tablero de transferencias'}[view];
 if(view==='history'){renderBoard();refreshShared();}
}
function openRecord(id){const record=drafts[id];if(!record)return;$('worker').value=record.worker;$('period').value=record.period;loadRecord(record);navigate('payroll');window.scrollTo({top:0,behavior:'smooth'});}
function card(record){
 const w=record.snapshot.worker,r=record.snapshot.result,paid=record.status==='transferred';
 return '<article class="transfer-card '+(paid?'paid':'')+'"><div class="transfer-heading"><div><h3>'+escapeHtml(w.name)+'</h3><p>'+escapeHtml(w.role)+'</p></div><strong class="transfer-amount">'+(r.ready?money(r.transfer):'Monto pendiente')+'</strong></div><div class="transfer-footer"><span class="badge">'+statusLabel[record.status]+'</span><div class="transfer-actions"><button class="button outline" data-open="'+escapeHtml(record.id)+'">Revisar</button>'+(committee&&record.status==='pending'?'<button class="button primary" data-transfer="'+escapeHtml(record.id)+'">Marcar realizada</button>':'')+'</div></div><details class="transfer-details"><summary>Detalles del registro</summary><p>'+escapeHtml(periodLabel(record.period))+' · Versión '+record.revision+'</p><p>Guardado por '+escapeHtml(record.savedBy)+' · '+dateLabel(record.savedAt)+'</p>'+(paid?'<p>Registrada por '+escapeHtml(record.transferredBy)+' · '+dateLabel(record.transferredAt)+(record.reference?'<br>Ref.: '+escapeHtml(record.reference):'')+'</p>':'')+'</details></article>';
}
function renderBoard(){
 const period=$('board-period').value,list=Object.values(drafts).filter(x=>!period||x.period===period);
 const columns=[['draft','Datos pendientes'],['pending','Por transferir'],['transferred','Transferidas']];
 const single=list.length>0&&new Set(list.map(x=>x.status)).size===1;
 $('history-list').classList.toggle('single-status',single);
 $('history-list').innerHTML=columns.map(([status,title])=>{const rows=list.filter(x=>x.status===status).sort((a,b)=>a.snapshot.worker.name.localeCompare(b.snapshot.worker.name));return '<section class="board-column" '+(single&&!rows.length?'hidden':'')+'><h2>'+title+' <span class="count">'+rows.length+'</span></h2>'+(rows.length?'<div class="board-cards">'+rows.map(card).join('')+'</div>':'<p class="board-empty">Sin registros en este estado.</p>')+'</section>';}).join('');
 $('import-local').hidden=committee||!Object.keys(legacyDrafts).some(key=>!drafts[key]);
 $('shared-state').textContent=storageReady?'Registros compartidos · '+(committee?'Comité: revisión y registro de transferencias':'Administración: creación y edición de borradores'):'';
 $('board-total').textContent=money(list.filter(x=>x.status==='transferred').reduce((sum,x)=>sum+x.snapshot.result.transfer,0));
}
async function refreshShared(){
 if(refreshing)return;refreshing=true;$('refresh-board').disabled=true;
 try{const response=await api('api/drafts');drafts=Object.fromEntries(response.drafts.map(record=>[record.id,record]));storageReady=true;$('shared-error').hidden=true;if(!initialSyncComplete){initialSyncComplete=true;loadRecord();}renderBoard();$('period-count').textContent=Object.values(drafts).filter(x=>x.period===$('period').value).length;}
 catch(error){storageReady=false;$('shared-error').textContent=error.message;$('shared-error').hidden=false;if(activeView==='payroll')showErrors([error.message]);}
 finally{refreshing=false;$('refresh-board').disabled=false;}
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('worker').innerHTML=WORKERS.map(w=>'<option value="'+w.id+'">'+escapeHtml(w.name)+' · '+escapeHtml(w.role)+'</option>').join('');
$('total-staff').textContent=$('team-count').textContent=WORKERS.length;
$('team-grid').innerHTML=WORKERS.map(w=>'<article class="worker-card"><span class="worker-avatar">'+initials(w.name)+'</span><div><strong>'+escapeHtml(w.name)+'</strong><small>'+escapeHtml(w.role)+'</small></div></article>').join('');
const today=new Date();$('period').value=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
document.querySelector('.private').textContent=committee?'Comité de administración · Solo lectura':'Administración';
document.querySelector('[data-view=history]').innerHTML='<span>▦</span> Transferencias';
if(committee){
 document.querySelector('[data-view=payroll]').hidden=true;document.querySelector('[data-view=team]').hidden=true;
 document.querySelector('.page-title h1').textContent='Revisión de borrador';document.querySelector('.page-title p').textContent='Consulta la versión guardada por administración. Los datos no se pueden editar.';
 const headings=$('payroll-form').querySelectorAll('.card-heading');headings[0].querySelector('h2').textContent='Trabajador del borrador';headings[0].querySelector('p').textContent='Personal registrado por administración.';headings[1].querySelector('h2').textContent='Datos del período';headings[1].querySelector('p').textContent='Asistencia, ausencias y anticipos del borrador guardado.';
 document.querySelector('.notice strong').textContent='Borrador de solo lectura';document.querySelector('.notice p').textContent='Revisa los haberes, descuentos y total a transferir. Puedes volver al tablero para registrar la transferencia realizada.';
}
$('history-view').innerHTML='<div class="eyebrow">CONTROL DE REMUNERACIONES</div><h1>Tablero de transferencias</h1><p class="section-description">'+(committee?'Revisa los borradores de administración y registra las transferencias que ya realizaste.':'Prepara los borradores y consulta las transferencias registradas por el comité.')+'</p><div class="board-toolbar"><div><label for="board-period">Período</label><input id="board-period" type="month"></div><button id="refresh-board" class="button outline">Actualizar</button><button id="backup" class="button outline">Descargar respaldo</button><button id="import-file" class="button outline" '+(committee?'hidden':'')+'>Importar respaldo</button><input id="import-file-input" type="file" accept="application/json,.json" hidden><button id="import-local" class="button outline" hidden>Publicar borradores de este navegador</button></div><p id="shared-state" class="helper"></p><div class="board-paid-total">Total registrado como transferido <strong id="board-total">$0</strong></div><div id="shared-error" class="error" role="alert" hidden></div><div id="history-list" class="transfer-board"></div><dialog id="transfer-dialog"><form id="transfer-form"><h2>Registrar transferencia realizada</h2><p id="transfer-summary"></p><label for="transfer-reference">Referencia del comprobante <span>Opcional</span></label><input id="transfer-reference" maxlength="120" autocomplete="off"><label class="transfer-check"><input id="transfer-confirm" type="checkbox" required> Confirmo que esta transferencia ya fue realizada.</label><p class="helper">Se registrará el monto de esta versión y el borrador quedará bloqueado para edición.</p><div id="transfer-error" class="error" role="alert" hidden></div><div class="transfer-actions"><button type="button" id="cancel-transfer" class="button outline">Cancelar</button><button id="confirm-transfer" type="submit" class="button primary">Confirmar registro</button></div></form></dialog>';
$('board-period').value=$('period').value;
$('board-period').addEventListener('change',renderBoard);$('refresh-board').addEventListener('click',refreshShared);
$('payroll-form').addEventListener('input',()=>{if(!committee&&viewRecord?.status!=='transferred')update();});
$('worker').addEventListener('change',()=>loadRecord());$('period').addEventListener('change',()=>loadRecord());
$('payroll-form').addEventListener('submit',async event=>{
 event.preventDefault();if(committee||viewRecord?.status==='transferred')return;const data=read(),result=Payroll.calculate(data,current());if(result.errors.length){showErrors(result.errors);return;}
 const button=event.submitter;button.disabled=true;
 try{const response=await api('api/drafts',{...data,expectedRevision:loadedRevision});drafts[response.draft.id]=response.draft;viewRecord=response.draft;loadedRevision=response.draft.revision;$('errors').hidden=true;update();toast('Borrador guardado y disponible para el comité.');}
 catch(error){showErrors([error.message]);if(error.status===409||error.status===423)await refreshShared();}finally{button.disabled=false;}
});
document.querySelectorAll('.nav').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.view)));
$('history-list').addEventListener('click',event=>{
 const open=event.target.closest('[data-open]');if(open){openRecord(open.dataset.open);return;}
 const button=event.target.closest('[data-transfer]');if(!button||!committee)return;
 pendingTransfer=JSON.parse(JSON.stringify(drafts[button.dataset.transfer]));$('transfer-summary').textContent=pendingTransfer.snapshot.worker.name+' · '+periodLabel(pendingTransfer.period)+' · '+money(pendingTransfer.snapshot.result.transfer)+' · Versión '+pendingTransfer.revision;
 $('transfer-form').reset();$('transfer-error').hidden=true;$('transfer-dialog').showModal();
});
$('cancel-transfer').addEventListener('click',()=>$('transfer-dialog').close());
$('transfer-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!committee||!pendingTransfer)return;$('confirm-transfer').disabled=true;
 try{const response=await api('api/drafts/'+encodeURIComponent(pendingTransfer.id)+'/transfer',{expectedRevision:pendingTransfer.revision,reference:$('transfer-reference').value});drafts[response.draft.id]=response.draft;$('transfer-dialog').close();renderBoard();toast('Transferencia registrada. El borrador quedó bloqueado.');}
 catch(error){$('transfer-error').textContent=error.message;$('transfer-error').hidden=false;await refreshShared();}finally{$('confirm-transfer').disabled=false;}
});
$('backup').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify({format:'nomina-compartida-v2',drafts},null,2)],{type:'application/json'}),'nomina-respaldo-'+new Date().toISOString().slice(0,10)+'.json'));
async function publishCandidates(candidates){
 if(committee)return;let count=0,failed=0,skipped=0;
 for(const [id,entry]of Object.entries(candidates)){if(!entry||typeof entry!=='object'){failed++;continue;}const data=entry.data||entry,key=data.worker+'_'+data.period;if(drafts[key]){skipped++;continue;}try{const response=await api('api/drafts',{worker:data.worker,period:data.period,...Object.fromEntries(Payroll.fields.map(field=>[field,data[field]??0])),expectedRevision:0});drafts[response.draft.id]=response.draft;count++;}catch{failed++;}}
 renderBoard();toast(count+' publicados · '+skipped+' existentes omitidos'+(failed?' · '+failed+' no se pudieron publicar.':'.'));
}
$('import-local').addEventListener('click',async()=>{$('import-local').disabled=true;try{await publishCandidates(legacyDrafts);}finally{$('import-local').disabled=false;}});
$('import-file').addEventListener('click',()=>$('import-file-input').click());
$('import-file-input').addEventListener('change',async()=>{
 if(committee)return;const file=$('import-file-input').files[0];if(!file)return;
 try{if(file.size>2000000)throw new Error('El respaldo supera el tamaño permitido.');const value=JSON.parse(await file.text());if(!value.drafts||typeof value.drafts!=='object'||Array.isArray(value.drafts))throw new Error('El archivo no contiene un respaldo de borradores.');await publishCandidates(value.drafts);}catch(error){toast(error.message);}finally{$('import-file-input').value='';}
});
$('download-pdf').addEventListener('click',()=>{
 const snapshot=viewRecord&&(committee||viewRecord.status==='transferred')?viewRecord.snapshot:null,data=snapshot?.data||read(),worker=snapshot?.worker||current(),result=snapshot?.result||Payroll.calculate(data,worker);
 if(result.errors.length){showErrors(result.errors);return;}if(!window.jspdf){showErrors(['No se pudo cargar el generador PDF.']);return;}
 const pdf=buildSummaryPdf(jspdf.jsPDF,worker,data,result),prefix=!result.ready?'Borrador':result.kind==='honorarios'?'Honorarios':'Liquidacion';pdf.save(prefix+'-'+worker.id+'-'+data.period+'.pdf');toast('PDF descargado.');
});
window.addEventListener('focus',()=>{if(activeView==='history')refreshShared();});
setInterval(()=>{if(activeView==='history'&&!document.hidden)refreshShared();},30000);
loadRecord();navigate(activeView);refreshShared();
