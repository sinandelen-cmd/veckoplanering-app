// Generates synthetic, non-personal test content locally. Never connects to Supabase.
import { writeFileSync } from 'node:fs'
const weeks = Array.from({ length: 52 }, (_, index) => ({
  week: index + 1,
  title: `Testvecka ${index + 1}`,
  notes: 'Syntetisk text för belastningstest. '.repeat(250),
  classes: Array.from({ length: 12 }, (_, classIndex) => ({
    name: `TEST-${classIndex + 1}`,
    lessons: Array.from({ length: 8 }, (_, lessonIndex) => ({
      title: `Testlektion ${lessonIndex + 1}`,
      text: 'Endast påhittade data. '.repeat(90)
    }))
  }))
}))
const payload = {
  kind: 'arsplanering-v2',
  title: 'Syntetisk stor årsplanering – belastningstest',
  schoolYear: '2026/2027',
  archived: false,
  weeksData: weeks
}
const output = process.argv[2] || 'synthetic-arsplanering.json'
writeFileSync(output, JSON.stringify(payload, null, 2))
console.log(`Created ${output} with ${weeks.length} synthetic weeks`)
