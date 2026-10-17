// Skolverkets fastställda provdatum för grundskolan läsåret 2026/27.
// Källa: https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-grundskola-sameskola-specialskola
// Detta är referensdata, inte redigerbara lektionsposter.
export const NATIONAL_EXAMS_2026_27 = [
  ['6','Svenska/SVA','B1+C1','2027-04-27'],['6','Svenska/SVA','B2+C2','2027-04-29'],
  ['6','Engelska','B','2027-04-19'],['6','Engelska','C','2027-04-21'],
  ['6','Matematik','B+C','2027-05-11'],['6','Matematik','D+E','2027-05-13'],
  ['9','Svenska/SVA','B','2027-03-17'],['9','Svenska/SVA','C','2027-03-19'],
  ['9','Engelska','B','2027-04-13'],['9','Engelska','C','2027-04-15'],
  ['9','Matematik','A+B','2027-05-12'],['9','Matematik','C+D','2027-05-14'],
  ['9','NO (skolans tilldelade ämne)','A+B','2027-04-20'],
  ['9','SO (skolans tilldelade ämne)','A','2027-04-28'],['9','SO (skolans tilldelade ämne)','B','2027-05-04'],
].map(([grade, subject, part, date]) => ({grade,subject,part,date, locked:true}))
export const NATIONAL_EXAM_PERIODS_2026_27 = [
  {grade:'3',subject:'Svenska/SVA och matematik',start:'2027-03-15',end:'2027-05-21'},
  {grade:'6',subject:'Muntliga delprov',start:'2026-11-02',end:'2026-12-04'},
  {grade:'9',subject:'Muntliga delprov',start:'2026-11-02',end:'2026-12-04'},
]
