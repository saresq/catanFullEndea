import { STORAGE_KEYS as KEYS } from "./const.js"

/**
 * Civilization pieces, per browser: on (the default) every player's settlements and cities are
 * drawn as their civilization's (html.civ-pieces, see constants.css), off shows the classic ones.
 */
export function civPiecesOn() {
  try { return localStorage.getItem(KEYS.CIV_PIECES) !== '0' } catch (e) { return true }
}

/** Sets the class the CSS reads; `save` also remembers the choice. */
export function setCivPieces(on, save = true) {
  document.documentElement.classList.toggle('civ-pieces', !!on)
  if (save) { try { localStorage.setItem(KEYS.CIV_PIECES, on ? '1' : '0') } catch (e) {} }
}

/** The art of everyone at the table, fetched before the first piece drops so it never lands blank. */
export function preloadCivPieces(players = []) {
  new Set(players.map(p => p?.civ).filter(Boolean)).forEach(civ => ['settlement', 'city'].forEach(kind => {
    new Image().src = `/images/pieces/civ/${civ}-${kind}.svg`
  }))
}
