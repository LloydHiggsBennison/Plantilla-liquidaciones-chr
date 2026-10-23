(function(root){
 const rules={version:'2026-10-23-v2',employerName:'Comunidad de ejemplo',nonTaxableAbsencePolicy:'prorate',fixedBonusAbsencePolicy:'prorate',
  // Solo parámetros verificados por período. No se reutilizan en meses futuros.
  periods:{
   '2026-09':{uf:41057.20,utm:71721,afpCapUF:90,afcCapUF:135.2},
   '2026-10':{uf:41247.63,utm:72151,afpCapUF:90,afcCapUF:135.2}
  },
  honorarios:{'provider-demo':{amountType:'gross',receiverWithholds:false}},
  honorariosRetentionByYear:{2026:0.1525},
  sources:{
   absence:'https://www.dt.gob.cl/legislacion/1624/w3-propertyvalue-156720.html',
   afp:'https://www.spensiones.cl/portal/institucional/594/w3-propertyvalue-9893.html',
   afc:'https://www.afc.cl/mi-seguro-de-cesantia/que-es-el-seguro/',
   caps:'https://www71.spensiones.cl/portal/institucional/594/articles-16921_recurso_1.pdf',
   uf:'https://www.sii.cl/valores_y_fechas/uf/uf2026.htm',
   tax:'https://www.sii.cl/valores_y_fechas/impuesto_2da_categoria/impuesto2026.htm',
   honorarios:'https://www.sii.cl/preguntas_frecuentes/declaracion_renta/001_140_8398.htm',
   communityHonorarios:'https://www.sii.cl/pagina/jurisprudencia/adminis/2015/renta/ja1977.htm'
  }
 };
 if(typeof module!=='undefined')module.exports=rules;else root.PayrollRules=rules;
})(typeof window==='undefined'?globalThis:window);
