# Nice to have

Ideas worth doing, not scheduled. Keep entries short: the idea, why it's cheap or
expensive, and where the code would be touched.

## Save custom maps in the browser

Let the map editor store maps locally so a player can come back another day and
pick their own map from the lobby selector, next to the presets.

**Why it's cheap.** A map is just a `mapkey` string (200 B - 1.5 KB). Presets
already live in one place (`CONST.MAPS` / `MAP_LIST` in `public/js/const.js`) and
both selectors build from that list, so saved maps only need to be merged into it.
The config travels over the socket as a raw `mapkey`, so guests need nothing and
the server does not change. The editor already round-trips a mapkey through
`?mapkey=`.

**localStorage, not cookies.** Cookies cap around 4 KB per domain and ride on every
HTTP request; three or four maps and you are out of room. localStorage gives 5 MB
and costs nothing per request. `STORAGE_KEYS` in `const.js` is the place to add it.

**Shape of the work.**

- A small module over one storage key, holding `[{ id, name, mapkey, saved_at }]`.
- Editor: a save button with a name, and a list to reopen or delete.
- Lobby (`login.js`) and waiting room (`waiting_room.js`): merge saved maps into the
  map select, under a "My maps" group, and resolve the mapkey from the merged list.

**Known rough edges.**

- `mapName()` only knows presets, so a saved map reads as "Custom" for guests unless
  the name is passed along in the emitted config.
- Per-browser and per-device; clearing site data wipes them. Good enough for "come
  back tomorrow", not for sharing - the existing `?mapkey=` link already covers that.
- `mapFitsPlayers()` lets any non-preset map through the player-count filter. Either
  leave it, or compute seats from the tile count when saving.

**The bigger alternative.** Persist maps server-side behind an API with an owner
token (the way endead does it). Real multi-device, maps shareable by ID, but it
needs a store, endpoints and some notion of identity. Only worth it if sharing by
ID becomes the point.
