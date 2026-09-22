/**
 * The one place visible text comes from. A locale is a plain data module in `public/locales`;
 * this module picks one and looks keys up in it, falling back to `en` and then to the key itself,
 * so a missing entry renders as `some.key` instead of throwing or printing `undefined`.
 *
 * Imported by the browser (`/js/i18n.js`) and by the server (`index.js` renders the views and the
 * redirect notices with the same dictionary), so it must stay free of DOM and Node specifics.
 */
import en from '../locales/en.js'
import esAR from '../locales/es-AR.js'

/** Every locale that ships, by tag. Adding a language is a file in `public/locales` and a line here. */
export const LOCALES = { en, 'es-AR': esAR }

/** The locale every page renders in. Fixed per page load; a switch is a change here plus a reload. */
export const LOCALE = 'es-AR'

/** `lookup(dict, 'names.pieces.S.name')` walks the nested objects; `undefined` when any step is missing. */
const lookup = (dict, key) => key.split('.').reduce(
  (node, part) => (node !== null && typeof node === 'object') ? node[part] : undefined, dict)

/** `{name}` -> `String(vars.name)`. A placeholder with no value is left as written. */
const fill = (text, vars) => vars
  ? text.replace(/\{(\w+)\}/g, (m, name) => name in vars ? String(vars[name]) : m)
  : text

/**
 * A translator for one locale: `t`, `t.plural`, `t.has` and the dictionary it reads. The page
 * uses the one built for `LOCALE` below; tests build one per locale.
 * @param {string} locale a key of `LOCALES`
 */
export function createT(locale) {
  const dict = LOCALES[locale] || en
  const raw = key => {
    const value = lookup(dict, key)
    return value === undefined ? lookup(en, key) : value
  }
  let rules = null
  try { rules = new Intl.PluralRules(locale) } catch (e) {}

  /**
   * The text for `key`, with `{var}` placeholders filled from `vars`. Values are authored HTML
   * where the surface renders HTML (log lines carry `<b>` and `<br>`); nothing is escaped here.
   * @param {string} key
   * @param {Object.<string, *>} [vars]
   * @returns {string}
   */
  const t = (key, vars) => {
    const value = raw(key)
    return typeof value === 'string' ? fill(value, vars) : key
  }

  /**
   * A `{ one, other }` entry chosen for `n`, with `{n}` and `vars` filled. The category comes
   * from `Intl.PluralRules`, and `other` stands in for any category the entry lacks.
   * @param {string} key
   * @param {number} n
   * @param {Object.<string, *>} [vars]
   * @returns {string}
   */
  t.plural = (key, n, vars) => {
    const entry = raw(key)
    if (!entry || typeof entry !== 'object') { return key }
    let category = 'other'
    try { category = rules ? rules.select(n) : 'other' } catch (e) {}
    const text = entry[category] ?? entry.other
    return typeof text === 'string' ? fill(text, { n, ...vars }) : key
  }

  /** Whether `key` resolves in this locale or in `en`. */
  t.has = key => raw(key) !== undefined

  return { t, dict, locale }
}

const active = createT(LOCALE)

/** The active dictionary, whole - what the Mustache views get as `t`. */
export const DICT = active.dict

export const t = active.t

export default t
