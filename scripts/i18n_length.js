// Which translated strings grew the most. `node scripts/i18n_length.js [locale]` lists every key
// whose value is longer than the `en` one by more than 30% or 8 characters, grouped by surface,
// longest growth first - the controls to look at first when checking the fit at phone width.
import { LOCALES } from '../public/js/i18n.js'

const locale = process.argv[2] || 'es-AR'
const en = LOCALES.en, dict = LOCALES[locale]
if (!dict) { console.error(`no locale ${locale}; have ${Object.keys(LOCALES).join(', ')}`); process.exit(2) }

/** Visible length: markup and placeholders do not count. */
const visible = s => s.replace(/<[^>]+>/g, '').replace(/\{\w+\}/g, '').length

const rows = []
const walk = (a, b, path) => {
  if (typeof a === 'string') {
    const from = visible(a), to = visible(b || '')
    if (to - from > 8 || to > from * 1.3) rows.push({ path, from, to, en: a, value: b })
    return
  }
  Object.keys(a).forEach(k => walk(a[k], b?.[k] ?? {}, path ? `${path}.${k}` : k))
}
walk(en, dict, '')

const bySurface = {}
rows.forEach(r => (bySurface[r.path.split('.')[0]] ||= []).push(r))
Object.entries(bySurface).forEach(([surface, list]) => {
  console.log(`\n## ${surface} (${list.length})`)
  list.sort((a, b) => (b.to - b.from) - (a.to - a.from)).forEach(r =>
    console.log(`  ${r.path}  ${r.from} -> ${r.to}  ${JSON.stringify(r.en)} -> ${JSON.stringify(r.value)}`))
})
console.log(`\n${rows.length} strings grew past the threshold`)
