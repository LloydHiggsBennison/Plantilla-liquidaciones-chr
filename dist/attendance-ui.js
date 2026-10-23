// Read the source first; applying a row only fills the form, never saves or transfers it.
(function(){
 if(committee)return;
 let report=null,busy=false;
 const panel=document.createElement('section');panel.className='card attendance-import';
 panel.innerHTML='<details><summary>Obtener asistencia desde la planilla</summary><p class="helper">Lee Turnos, Nocheros y ASEO del período seleccionado. Revisa los resultados antes de usar los datos en una liquidación.</p><div class="transfer-actions"><button type="button" class="button outline" id="attendance-google">Leer Google Sheets</button><button type="button" class="button outline" id="attendance-upload">Cargar Excel de la planilla</button><input id="attendance-file" type="file" accept=".xlsx" hidden></div><p id="attendance-status" class="helper" role="status"></p><div id="attendance-result"></div></details>';
 document.querySelector('.editor-layout').before(panel);
 const google=$('attendance-google'),upload=$('attendance-upload'),file=$('attendance-file'),status=$('attendance-status'),result=$('attendance-result');
 const eventLabel=e=>({replacementDays:'Días adicionales',overtimeHours:'Horas extras','honorarios-day':'Jornada de honorarios',worked:'Asistencia',absent:'Ausencia',vacation:'Vacaciones'}[e.credit||e.kind]||e.credit||e.kind);
 const source=item=>[item.date,item.sheet,item.cell||(item.row?'fila '+item.row:'')].filter(Boolean).join(' · ');
 function render(){
  if(!report)return;result.innerHTML='<p class="helper">'+escapeHtml(periodLabel(report.period))+' · '+Object.entries(report.coverage).map(([name,count])=>escapeHtml(name)+': '+count+' fechas').join(' · ')+'</p>'+
   '<div class="attendance-table-wrap"><table class="attendance-table"><thead><tr><th>Trabajador</th><th>Días base</th><th>Ausencias</th><th>Vacaciones</th><th>Días adicionales</th><th>Horas extras</th><th></th></tr></thead><tbody>'+report.summaries.map(r=>'<tr><td><strong>'+escapeHtml(r.name)+'</strong><small>'+escapeHtml(r.role)+'</small>'+(r.scheduleReference?'<small>'+escapeHtml(r.scheduleReference)+'</small>':'')+'</td><td>'+r.worked+'</td><td>'+r.absent+'</td><td>'+r.vacation+'</td><td>'+r.replacementDays+'</td><td>'+r.overtimeHours+'</td><td><button type="button" class="button outline" data-attendance-use="'+escapeHtml(r.worker)+'" '+(!r.events.length||r.issues.length?'disabled':'')+'>Usar datos</button><details><summary>Ver origen</summary>'+r.events.map(e=>'<p>'+escapeHtml(source(e))+' · '+escapeHtml(eventLabel(e))+(e.amount?' · '+e.amount:'')+'</p>').join('')+r.issues.map(e=>'<p>'+escapeHtml(source(e))+' · '+escapeHtml(e.message)+'</p>').join('')+(!r.events.length?'<p>Sin registros para este trabajador en las hojas leídas.</p>':'')+'</details></td></tr>').join('')+'</tbody></table></div>'+
   (report.issues.length?'<details class="attendance-issues"><summary>'+report.issues.length+' observaciones por revisar</summary>'+report.issues.map(e=>'<p>'+escapeHtml(source(e))+' · '+escapeHtml(e.message)+'</p>').join('')+'</details>':'')+
   '<p class="helper">Usar datos completa el formulario del trabajador. No modifica anticipos ni guarda borradores. Los reemplazos se suman aparte: un día completo o medio día por cada 4 horas de cobertura compartida.</p>';
 }
 async function readSource(body){
  if(busy)return;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test($('period').value)){status.textContent='Selecciona el período de liquidación.';return;}
  busy=true;google.disabled=upload.disabled=true;status.textContent='Leyendo fechas, colores y observaciones…';result.replaceChildren();report=null;
  try{report=await api(body?'api/attendance':'api/attendance?period='+encodeURIComponent($('period').value),body?{...body,period:$('period').value}:undefined);render();status.textContent='Lectura completada. Revisa cada fila antes de aplicarla.';}
  catch(e){status.textContent=e.message;}finally{busy=false;google.disabled=upload.disabled=false;}
 }
 google.addEventListener('click',()=>readSource());upload.addEventListener('click',()=>file.click());
 file.addEventListener('change',async()=>{const chosen=file.files[0];if(!chosen)return;if(chosen.size>2*1024*1024){status.textContent='El archivo debe pesar menos de 2 MB.';file.value='';return;}
  try{const bytes=new Uint8Array(await chosen.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);await readSource({file:btoa(binary)});}catch{status.textContent='No se pudo leer el archivo.';}finally{file.value='';}
 });
 result.addEventListener('click',event=>{const button=event.target.closest('[data-attendance-use]');if(!button||!report)return;
  if(report.period!==$('period').value){status.textContent='Cambió el período. Vuelve a leer la planilla para este mes.';return;}
  const row=report.summaries.find(r=>r.worker===button.dataset.attendanceUse);if(!row||row.issues.length)return;
  if(!storageReady){status.textContent='Espera a que se conecte el guardado compartido antes de aplicar datos.';return;}
  if(drafts[row.worker+'_'+report.period]?.status==='transferred'){status.textContent='Esta transferencia ya está registrada y no se puede modificar.';return;}
  $('worker').value=row.worker;loadRecord();if(row.scheduleReference){$('worked').value=Math.max(0,row.worked-Number($('absent').value||0)-Number($('vacation').value||0));}else for(const key of ['worked','absent','vacation','replacementDays','overtimeHours'])$(key).value=row[key];update();panel.querySelector('details').open=false;$('payroll-form').scrollIntoView({behavior:'smooth',block:'start'});toast('Datos cargados para '+row.name+'. Revisa y guarda el borrador.');
 });
 $('period').addEventListener('change',()=>{report=null;result.replaceChildren();status.textContent='Selecciona la fuente para leer el nuevo período.';});
})();
