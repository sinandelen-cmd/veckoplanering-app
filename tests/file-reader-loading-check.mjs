import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
assert.doesNotMatch(source,/^import .*from ['"](?:xlsx|mammoth|pdfjs-dist)/m)
const extract=name=>{
 const start=source.indexOf('function '+name+'(')
 assert.ok(start>=0,name+' must exist')
 const asyncStart=source.slice(Math.max(0,start-6),start)==='async '?start-6:start
 const next=source.slice(start+1).search(/\n(?:async function |function |let |const |class |export )/)
 return next<0?source.slice(asyncStart):source.slice(asyncStart,start+1+next)
}
// SSR tests must use Mammoth's browser build: the app's arrayBuffer API is browser-specific.
const functions=['loadSpreadsheet','loadWordReader','extractText','unitsFromWorkbook'].map(extract).join('\n').replace("import('mammoth')","import('mammoth/mammoth.browser.js')")
const fixture=`import assert from 'node:assert/strict'
let XLSX
let pdfLoads=0
const loadPdfReader=async()=>{pdfLoads++;return {getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'PDF-text',transform:[1,0,0,1,10,10]}]})})})})}}
const recognizeImage=async file=>'Bildtext '+file.name
${functions}
assert.equal(XLSX,undefined)
assert.equal(await extractText({name:'text.txt',text:async()=>'Vanlig text'}),'Vanlig text')
assert.equal(await extractText({name:'data.csv',text:async()=>'a,b'}),'a,b')
assert.equal(XLSX,undefined,'Text input must not load the spreadsheet reader')
for(const name of ['bild.png','bild.jpeg','bild.webp']) assert.equal(await extractText({name}),'Bildtext '+name)
await assert.rejects(()=>extractText({name:'gammal.doc'}),error=>error.message.includes('Spara som .docx'))
const xlsx=await loadSpreadsheet()
assert.equal(await loadSpreadsheet(),xlsx)
const book=xlsx.utils.book_new()
xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([['Kapitel','Moment'],['Tal','Bråk'],['Tal','Decimalform']]),'Planering')
const bytes=xlsx.write(book,{bookType:'xlsx',type:'array'})
const text=await extractText({name:'planering.xlsx',arrayBuffer:async()=>bytes})
assert.ok(text.includes('Bråk')&&text.includes('Decimalform'))
assert.deepEqual(unitsFromWorkbook(book).map(item=>item.topic),['Bråk','Decimalform'])
const crc32=data=>{let crc=0xffffffff;for(const value of data){crc^=value;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
const zip=entries=>{
 const local=[],central=[];let offset=0
 for(const [name,text] of entries){
  const filename=Buffer.from(name),data=Buffer.from(text),crc=crc32(data)
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26)
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42)
  local.push(header,filename,data);central.push(directory,filename);offset+=header.length+filename.length+data.length
 }
 const body=Buffer.concat(local),directory=Buffer.concat(central),end=Buffer.alloc(22)
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(body.length,16)
 return Buffer.concat([body,directory,end])
}
const docx=zip([
 ['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
 ['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
 ['word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Syntetisk Word-planering</w:t></w:r></w:p></w:body></w:document>']
])
const docxText=await extractText({name:'planering.docx',arrayBuffer:async()=>docx.buffer.slice(docx.byteOffset,docx.byteOffset+docx.byteLength)})
assert.ok(docxText.includes('Syntetisk Word-planering'))
assert.equal(pdfLoads,0)
assert.equal(await extractText({name:'planering.pdf',arrayBuffer:async()=>new ArrayBuffer(0)}),'PDF-text')
assert.equal(pdfLoads,1,'PDF reader is requested only for a PDF')
console.log('PASS: lazy readers, real Excel and DOCX import, text/CSV/image routing and PDF extraction path')
`
const dir=fs.mkdtempSync(path.join(process.cwd(),'.file-reader-test-'))
try{
 const entry=path.join(dir,'fixture.jsx');fs.writeFileSync(entry,fixture)
 const config=path.join(dir,'vite.config.mjs');fs.writeFileSync(config,'export default '+JSON.stringify({logLevel:'warn',build:{ssr:entry,outDir:path.join(dir,'dist'),emptyOutDir:true,rollupOptions:{output:{entryFileNames:'fixture.mjs'}}}}))
 const require=createRequire(import.meta.url),cli=path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js')
 assert.equal(spawnSync(process.execPath,[cli,'build','--config',config],{stdio:'inherit'}).status,0)
 assert.equal(spawnSync(process.execPath,[path.join(dir,'dist','fixture.mjs')],{stdio:'inherit'}).status,0)
}finally{fs.rmSync(dir,{recursive:true,force:true})}
