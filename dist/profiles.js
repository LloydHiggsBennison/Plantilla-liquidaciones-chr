(function(root){
 function rows(w){
  const result=[{label:w.salaryBasis==='day'?'Sueldo base por día':'Sueldo base mensual',amount:w.salaryBasis==='day'?w.dailyRate:w.base,basis:w.salaryBasis==='day'?'day':'month',taxable:true}];
  return result.concat(w.allowances||[]);
 }
 function basisLabel(basis){return {month:'mensual',day:'por día',september:'pagado en septiembre'}[basis]||'';}
 root.WorkerProfiles={rows,basisLabel};
})(typeof window==='undefined'?globalThis:window);
