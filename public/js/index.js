import Game from "./game.js"

// Apply GodMode theme based on current game session flag
try {
  if (window.game_obj && window.game_obj.godmode) {
    document.documentElement.classList.add('godmode')
  } else {
    document.documentElement.classList.remove('godmode')
  }
} catch (e) {}

const socket = io()
const game = new Game(window.game_obj, window.player_obj, window.opponents_obj, socket)

window.game = game
