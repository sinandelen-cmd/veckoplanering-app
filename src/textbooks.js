// Läromedelskatalog och hjälpfunktioner för läromedelskurser.
// ISBN fylls i endast från verifierade källor. Tomt värde betyder "ej angivet" och ska aldrig gissas.

export const TEXTBOOK_CATALOG = {
  Grundskola: {
    Matematik: ['Matte Direkt','Matematik XYZ','Favorit matematik','Prio Matematik','Koll på matematik','Eldorado','Matematik Alfa Beta Gamma','Milli matematik','Matte Direkt Triumf',"Singma matematik","Matematikboken","Pixel matematik","Prima matematik","Mondo matematik","Matematik X","Matematik Y","Matematik Z"],
    Svenska: ['Klara svenskan','Prima svenska','Simsalabim','Zick Zack','Spegla språket','Svenska impulser','Kontakt','Arkad','Jalla','Upptäck texten',"Svenska Direkt","Bums svenska","ABC-klubben","Läsresan","Språkskrinet","Robin"],
    Engelska: ['Awesome','Sparks',"What's Up?","Magic!","Wings","Good Stuff","New Champion","Happy"],
    Biologi: ['Spektrum','Titano','PULS',"Biologi Direkt","NO Direkt","Utkik Biologi"],
    Fysik: ['Spektrum','Titano','PULS',"Fysik Direkt","NO Direkt","Utkik Fysik"],
    Kemi: ['Spektrum','Titano','PULS',"Kemi Direkt","NO Direkt","Utkik Kemi"],
    Historia: ['SOL Nova','Utkik','Koll på',"Historia Direkt","SO Direkt","PULS Historia"],
    Geografi: ['SOL Nova','Utkik','Koll på',"Geografi Direkt","SO Direkt","PULS Geografi"],
    Samhällskunskap: ['SOL Nova','Utkik','Koll på',"Samhällskunskap Direkt","SO Direkt","PULS Samhällskunskap"],
    Religionskunskap: ['SOL Nova','Utkik','Koll på',"Religion Direkt","SO Direkt","PULS Religion"],
    Spanska: ['Qué bien',"¡Vale!","¡Vamos!","Caminando"], Franska: ['Bon Voyage','Chez nous',"Escalade","Allez hop!"], Tyska: ['Der Sprung','Alles Deutsch',"Lieber Deutsch","Genau!"],
    Teknik: ["Teknik Direkt","PULS Teknik"],
  },
  Gymnasiet: {
    Matematik: ['Matematik 5000+','Matematik 7000','Matematik Origo','CordaNova',"Matematik 5000","Matematik 4000","Exponent","M-serien"],
    Svenska: ['Svenska impulser','Människans texter','Helt enkelt','Språkporten',"Svenska rum","Svenska för livet"],
    Engelska: ['Blueprint','Solid Gold','Viewpoints',"Progress Gold","Echo","Blueprint A"],
    Fysik: ['Heureka',"Impuls Fysik","Ergo Fysik"], Kemi: ['Gymnasiekemi',"Kemiboken","Reaktion Kemi"], Biologi: ['Iris',"Biologi Campus","Spira Biologi"],
    Historia: ['Perspektiv på historien',"Alla tiders historia","Epok Historia"], Samhällskunskap: ['Reflex',"Forum Samhällskunskap","Kompass Samhällskunskap"],
    Naturkunskap: ['Frank','Synpunkt',"Insikt Naturkunskap"], Företagsekonomi: ['E3000',"Goodwill Företagsekonomi","E2000"],
    Religionskunskap: ["Under samma himmel"],
    Psykologi: ["Psykologi 1 och 2"],
    Filosofi: ["Filosofi 1 och 2"],
    Geografi: ["Geografi 1 och 2"],
    Spanska: ["Caminando"],
    Franska: ["Escalade"],
    Tyska: ["Lieber Deutsch"],
  }
}

export const TEXTBOOK_PUBLISHERS = {
  'Matte Direkt':'Sanoma Utbildning','Matematik XYZ':'Liber','Favorit matematik':'Studentlitteratur',
  'Matematik 5000+':'Natur & Kultur','Matematik 5000':'Natur & Kultur','Matematik 7000':'Natur & Kultur',
  'Matematik Origo':'Sanoma Utbildning','Matematikboken':'Liber','Svenska Direkt':'Sanoma Utbildning',
  'Svenska impulser':'Sanoma Utbildning','Klara svenskan':'Natur & Kultur',
  'Spektrum':'Liber','SOL Nova':'Natur & Kultur','PULS':'Natur & Kultur',
  'Heureka':'Natur & Kultur','Blueprint':'Liber','Good Stuff':'Liber',
  'Prio Matematik':'Sanoma Utbildning','Eldorado':'Natur & Kultur',
  'Matematik Alfa Beta Gamma':'Liber','Zick Zack':'Sanoma Utbildning',
  'Simsalabim':'Sanoma Utbildning','Prima svenska':'Gleerups'
}

// Tom tills verifierade ISBN läggs in. Nyckel = boktitel som i katalogen.
export const TEXTBOOK_ISBNS = {}

export function normalizeIsbn(value) {
  return String(value || '').replace(/[\s-]/g, '').toUpperCase()
}

export function isValidIsbn(value) {
  const isbn = normalizeIsbn(value)
  if (isbn.length === 10) {
    if (!/^\d{9}[\dX]$/.test(isbn)) return false
    const sum = [...isbn].reduce((total, char, index) => total + (char === 'X' ? 10 : Number(char)) * (10 - index), 0)
    return sum % 11 === 0
  }
  if (isbn.length === 13) {
    if (!/^\d{13}$/.test(isbn)) return false
    const sum = [...isbn].reduce((total, char, index) => total + Number(char) * (index % 2 === 0 ? 1 : 3), 0)
    return sum % 10 === 0
  }
  return false
}

const foldText = value => String(value || '').toLocaleLowerCase('sv').replace(/\s+/g, ' ').trim()

export function booksForSubject(school, subject) {
  const group = TEXTBOOK_CATALOG[school] || {}
  const key = Object.keys(group).find(name => name.toLocaleLowerCase('sv') === String(subject).toLocaleLowerCase('sv'))
  return (key ? group[key] : []).map(title => ({
    title, subject: key || subject, school,
    publisher: TEXTBOOK_PUBLISHERS[title] || 'Förlag ej angivet',
    isbn: TEXTBOOK_ISBNS[title] || '',
    levels: school === 'Gymnasiet' ? 'Gymnasiet' : 'Grundskolan'
  })).sort((a, b) => a.title.localeCompare(b.title, 'sv'))
}

// Söker i alla ämnen för ett skolstadium på titel, förlag, ämne eller ISBN.
export function searchTextbooks(school, query) {
  const needle = foldText(query)
  if (!needle) return []
  const isbnNeedle = normalizeIsbn(query)
  const subjects = Object.keys(TEXTBOOK_CATALOG[school] || {})
  return subjects.flatMap(subject => booksForSubject(school, subject))
    .filter(book => [book.title, book.publisher, book.subject].some(value => foldText(value).includes(needle))
      || (isbnNeedle.length >= 3 && normalizeIsbn(book.isbn).includes(isbnNeedle)))
}

// Samma läromedel får inte läggas in två gånger inom samma ämne och skolstadium.
export function isDuplicateTextbook(existing, { school, subject, title }) {
  return (existing || []).some(book => book.school === school
    && foldText(book.subject) === foldText(subject)
    && foldText(book.title) === foldText(title))
}

// Manuell registrering. Returnerar antingen { ok: true, book } eller { ok: false, error }.
export function buildManualTextbook({ school, subject, title, publisher, isbn }, existing = []) {
  const cleanTitle = String(title || '').trim()
  const cleanSubject = String(subject || '').trim()
  if (!['Grundskola', 'Gymnasiet'].includes(school)) return { ok: false, error: 'Välj skolstadium.' }
  if (!cleanSubject) return { ok: false, error: 'Ange ämne.' }
  if (!cleanTitle) return { ok: false, error: 'Ange läromedlets titel.' }
  const cleanIsbn = normalizeIsbn(isbn)
  if (cleanIsbn && !isValidIsbn(cleanIsbn)) return { ok: false, error: 'ISBN-numret är ogiltigt. Kontrollera siffrorna.' }
  const book = {
    title: cleanTitle,
    subject: cleanSubject,
    school,
    publisher: String(publisher || '').trim() || 'Förlag ej angivet',
    isbn: cleanIsbn,
    levels: school === 'Gymnasiet' ? 'Gymnasiet' : 'Grundskolan',
    manual: true,
  }
  if (isDuplicateTextbook(existing, book)) return { ok: false, error: 'Det här läromedlet finns redan i ämnet för skolstadiet.' }
  return { ok: true, book }
}
