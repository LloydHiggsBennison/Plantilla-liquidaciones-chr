(function(){
 if(committee)return;
 let review=null,selected=new Set(),busy=false,openVersion=0;
 const panel=document.createElement('dialog');panel.id='mail-dialog';panel.className='mail-dialog';
 panel.innerHTML='<div class="mail-heading"><div><h2>Enviar pre nóminas</h2><p id="mail-period"></p></div><button type="button" class="button outline" id="mail-close">Cerrar</button></div><p>Usa los borradores guardados. Verifica el nombre, correo y PDF de cada destinatario antes de enviar.</p><p class="helper" id="mail-sender"></p><div id="mail-error" class="error" role="alert" hidden></div><p id="mail-connection" class="helper"></p><div class="mail-table-wrap"><table class="mail-table"><thead><tr><th><input type="checkbox" id="mail-all" aria-label="Seleccionar todos los destinatarios habilitados"></th><th>Trabajador</th><th>Correo del trabajador</th><th>Estado</th><th>Adjunto</th></tr></thead><tbody id="mail-rows"></tbody></table></div><details class="mail-text"><summary>Texto del correo</summary><p id="mail-template"></p></details><label class="mail-confirm"><input type="checkbox" id="mail-confirm"> Confirmo que revisé las correspondencias entre trabajador, correo y PDF de los destinatarios seleccionados.</label><p id="mail-progress" role="status" aria-live="polite"></p><div class="mail-footer"><span>Un correo y un PDF por trabajador, sin copias a otras personas.</span><button type="button" id="mail-send" class="button primary" disabled>Enviar 0 correos individuales</button></div>';
 document.body.append(panel);
 const bulk=document.createElement('button');bulk.type='button';bulk.className='button primary';bulk.id='mail-open';bulk.textContent='Enviar pre nóminas';document.querySelector('.board-toolbar').append(bulk);
 const single=document.createElement('button');single.type='button';single.className='button outline download';single.id='mail-single';single.textContent='Enviar esta pre nómina';$('download-pdf').after(single);
 const error=message=>{$('mail-error').hidden=!message;$('mail-error').textContent=message||'';};
 function controls(){const enabled=review?.rows.filter(r=>r.eligible&&review.configured)||[];$('mail-send').disabled=busy||!selected.size||!$('mail-confirm').checked||!review?.configured;$('mail-send').textContent=(busy?'Enviando':'Enviar')+' '+selected.size+' correo'+(selected.size===1?' individual':'s individuales');$('mail-close').disabled=busy;$('mail-confirm').disabled=busy;$('mail-all').disabled=busy||!enabled.length;$('mail-all').checked=enabled.length>0&&enabled.every(r=>selected.has(r.worker));$('mail-all').indeterminate=selected.size>0&&!$('mail-all').checked;}
 function render(){
  $('mail-rows').innerHTML=review.rows.map(r=>'<tr><td><input type="checkbox" data-mail-worker="'+escapeHtml(r.worker)+'" aria-label="Enviar a '+escapeHtml(r.name)+'" '+(selected.has(r.worker)?'checked ':'')+(!r.eligible||!review.configured||busy?'disabled':'')+'></td><td><strong>'+escapeHtml(r.name)+'</strong><small>'+escapeHtml(r.role)+(r.revision?' · Versión '+r.revision:'')+'</small></td><td>'+escapeHtml(r.email||'Sin correo configurado')+'</td><td><span class="badge">'+escapeHtml(({sent:'Enviado',sending:'En proceso',uncertain:'Comprobar en Gmail',failed:'No enviado',ready:'Por enviar',blocked:'Pendiente'}[r.status])||r.status)+'</span><small>'+escapeHtml(r.message)+(r.sentAt?' · '+escapeHtml(dateLabel(r.sentAt)):'')+'</small></td><td>'+(r.canPreview?'<button type="button" class="button outline" data-mail-pdf="'+escapeHtml(r.worker)+'" '+(busy?'disabled':'')+'>Ver PDF</button>':'—')+'</td></tr>').join('');controls();
 }
 async function open(period,worker){
  if(busy)return;
  if(worker){const stored=drafts[worker+'_'+period],data=read();if(!stored||Payroll.fields.some(k=>Number(data[k]||0)!==Number(stored.data[k]||0))){showErrors(['Guarda los cambios del borrador antes de preparar el correo.']);return;}}
  const version=++openVersion;review=null;error('');selected.clear();$('mail-confirm').checked=false;$('mail-progress').textContent='Cargando destinatarios…';$('mail-period').textContent=periodLabel(period);$('mail-rows').innerHTML='';for(const id of ['mail-sender','mail-template','mail-connection'])$(id).textContent='';controls();$('mail-confirm').disabled=true;panel.showModal();
  try{const response=await api('api/mail/preview?period='+encodeURIComponent(period));if(version!==openVersion||!panel.open)return;review=response;$('mail-sender').textContent='Remitente: '+review.sender;$('mail-template').textContent=review.template;$('mail-connection').textContent=review.configured?'Selecciona los destinatarios que recibirán su pre nómina.':'Envío deshabilitado. Configura GMAIL_APP_PASSWORD en Vercel. Los trabajadores sin correo quedarán excluidos.';if(worker&&review.configured&&review.rows.some(r=>r.worker===worker&&r.eligible))selected.add(worker);$('mail-progress').textContent='';render();}
  catch(e){if(version!==openVersion||!panel.open)return;review=null;error(e.message);$('mail-progress').textContent='';controls();}
 }
 bulk.addEventListener('click',()=>{const period=$('board-period').value;if(!period){toast('Selecciona el período que vas a enviar.');return;}open(period);});
 single.addEventListener('click',()=>open($('period').value,current().id));
 $('mail-close').addEventListener('click',()=>panel.close());panel.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('mail-confirm').addEventListener('change',controls);
 $('mail-all').addEventListener('change',()=>{if(!review)return;selected=new Set($('mail-all').checked?review.rows.filter(r=>r.eligible&&review.configured).map(r=>r.worker):[]);$('mail-confirm').checked=false;render();});
 $('mail-rows').addEventListener('change',event=>{const box=event.target.closest('[data-mail-worker]');if(!box)return;if(box.checked)selected.add(box.dataset.mailWorker);else selected.delete(box.dataset.mailWorker);$('mail-confirm').checked=false;controls();});
 $('mail-rows').addEventListener('click',async event=>{
  const button=event.target.closest('[data-mail-pdf]');if(!button||busy)return;button.disabled=true;error('');
  try{const response=await fetch('api/mail/pdf',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':profile.csrf},body:JSON.stringify({token:review.token,worker:button.dataset.mailPdf})});if(!response.ok){const value=await response.json();throw new Error(value.error||'No se pudo preparar el PDF.');}downloadBlob(await response.blob(),review.rows.find(r=>r.worker===button.dataset.mailPdf).filename);}
  catch(e){error(e.message);}finally{button.disabled=false;}
 });
 $('mail-send').addEventListener('click',async()=>{
  if(busy||!selected.size||!$('mail-confirm').checked||!review?.configured)return;
  const batch=[...selected];busy=true;error('');render();let sent=0,failed=0,processed=0;
  try{for(const worker of batch){const row=review.rows.find(r=>r.worker===worker);$('mail-progress').textContent='Procesando '+(processed+1)+' de '+batch.length+': '+row.name;
    try{const result=await api('api/mail/send',{token:review.token,worker});row.status=result.status;row.message=result.message;row.eligible=false;processed++;if(result.status==='sent')sent++;else failed++;selected.delete(worker);render();if(result.stopBatch)break;}
    catch(e){row.status=e.status?'blocked':'uncertain';row.message=e.message;row.eligible=false;processed++;failed++;selected.delete(worker);render();if(!e.status||e.status===503||e.status===401)break;}
   }}finally{busy=false;selected.clear();$('mail-confirm').checked=false;render();$('mail-progress').textContent=sent+' correo(s) aceptado(s) por Gmail · '+failed+' sin completar'+(processed<batch.length?' · '+(batch.length-processed)+' no intentado(s)':'')+'. Abre nuevamente la revisión para consultar el estado guardado.';}
 });
})();
