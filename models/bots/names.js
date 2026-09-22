import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Player from '../player.js'
import { shuffle } from '../../public/js/utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const NAMES_FILE = path.join(__dirname, '../../config/bot_names.json')
export const BUILT_IN_NAMES = ['Robo', 'Beep', 'Tin', 'Cog', 'Bolt', 'Gizmo', 'Sprocket', 'Widget', 'Rivet', 'Pixel']

/**
 * Names from the editable file, cleaned like any player name. Read on every call: the list is
 * tiny, a bot is added a handful of times per game, and an edit shows up without a restart.
 * Missing, empty or invalid file -> the built-in list and a warning, never a throw.
 */
export function loadNames(file = NAMES_FILE) {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(list)) { throw new Error('not a JSON array') }
    const names = [...new Set(list.map(n => typeof n === 'string' ? Player.cleanName(n) : '').filter(Boolean))]
    if (!names.length) { throw new Error('no usable names') }
    return names
  } catch (e) {
    console.warn(`[bots] ${file}: ${e.message} - using built-in bot names`)
    return BUILT_IN_NAMES.slice()
  }
}

/** A random name nobody in the room has; numbered once the list runs out. */
export function pickName(taken = [], file = NAMES_FILE) {
  const used = new Set(taken)
  const names = shuffle(loadNames(file))
  const free = names.find(n => !used.has(n))
  if (free) { return free }
  for (let i = 2; ; i++) {
    const numbered = names.map(n => Player.cleanName(`${n.slice(0, 20)} ${i}`)).find(n => !used.has(n))
    if (numbered) { return numbered }
  }
}
