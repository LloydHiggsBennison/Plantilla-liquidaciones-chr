// Datos ficticios. Copia local: npm run setup:demo. Nunca usar esta configuración para pagos reales.
window.WORKERS=[
 {id:'monthly-demo',name:'Trabajador de ejemplo',role:'Conserje',employmentType:'employee',salaryBasis:'month',base:900000,dailyRate:null,pending:[],allowances:[
  {label:'Bono asistencia',amount:30000,basis:'month',taxable:true},
  {label:'Colación',amount:50000,basis:'month',taxable:false},
  {label:'Movilización',amount:60000,basis:'month',taxable:false}
 ]},
 {id:'provider-demo',name:'Prestador de ejemplo',role:'Apoyo',employmentType:'honorarios',salaryBasis:'day',dailyRate:40000,base:null,pending:[],allowances:[]}
];
