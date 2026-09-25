/**
 * Board layouts, one string per preset. Kept out of `const.js` so that file stays
 * readable; `const.js` re-exports everything here, so `CONST.DEFAULT_MAPKEY` still works.
 */

export const DEFAULT_MAPKEY =
  `S(br_*3).S.S(bl_W2).S
  -S.M10.G2.J9.S(bl_O2)
  -S(r_L2).F12.C6.G4.C10.S
  -S.F9.J11.D.J3.M8.S(l_*3)
  +S(r_B2).J8.M3.F4.G5.S
  +S.C5.F6.G11.S(tl_S2)
  +S(tr_*3).S.S(tl_*3).S`

/**
 * The tier presets follow the 5-6 Player Expansion and its escalation: from 4 to 5-6 players the
 * expansion adds 2 hexes of each resource, 1 desert, one more disc of each number and 2 generic
 * ports; the 7-8 and 9-10 tiers add the same step again. Presets always shuffle, so the
 * arrangement here is only a starting point; `tests/board_presets_test.js` asserts the counts.
 */

// 5-6 players: 30 land hexes (5 hills, 6 forests, 6 pastures, 5 mountains, 6 fields, 2 deserts) in
// rows of 3-4-5-6-5-4-3, 28 discs, 11 ports (6 generic, one 2:1 per resource)
export const DEFAULT_MAPKEY_5_6 =
  `S.S(bl_*3).S.S(bl_*3)
  -S(r_*3).F5.F10.G6.S
  -S.M8.F3.C12.C9.S(l_W2)
  -S(r_*3).C4.G12.J4.F8.J10.S
  -S.M6.C2.J6.D.M11.G3.S(l_*3)
  +S(r_O2).J4.F11.G2.C9.G5.S
  +S.D.M8.J10.J11.S(l_B2)
  +S(tr_S2).F3.G5.M9.S
  +S.S(tl_L2).S.S(tl_*3)`

// 7-8 players: 41 land hexes (7/8/8/7/8, 3 deserts), 38 discs, 13 ports (8 generic)
export const DEFAULT_MAPKEY_7_8 =
  `S.S(bl_*3).S.S(bl_B2).S.S(bl_*3)
  -S(r_S2).J9.M3.J4.C8.C3.S
  -S.C4.F11.F6.M11.M4.J11.S(l_*3)
  -S(r_L2).D.G6.M4.F5.J2.C12.J6.S
  -S.C12.M2.M10.G8.C11.G10.G9.D.S(l_*3)
  -S(r_*3).G6.F9.J3.G5.G10.F8.C5.G3.S
  +S.J12.F5.M10.D.F2.J9.F8.S(tl_*3)
  +S(tr_W2).S.S(tr_O2).S.S(tr_*3).S.S(tl_*3).S`

// 9-10 players: 52 land hexes (9/10/10/9/10, 4 deserts), 48 discs, 15 ports (10 generic)
export const DEFAULT_MAPKEY_9_10 =
  `S.S(br_*3).S.S(br_O2).S
  -S(r_*3).C8.M11.J10.G6.S(l_S2)
  -S.M3.C9.D.M4.F9.S
  -S(r_*3).C11.C5.M10.F6.J10.C6.S(bl_*3)
  -S(r_L2).M12.J8.F4.J9.M2.G5.G12.S
  -S.G8.G11.D.F6.G3.M11.J8.G5.S(l_*3)
  +S(r_*3).G5.M4.J3.G2.F9.C3.J4.S(tl_*3)
  +S.J6.F9.C12.F4.D.F10.S
  +S(r_B2).F2.F5.C10.J12.M2.S(l_*3)
  +S.G8.D.C11.J3.S
  +S(tr_*3).S.S(tl_*3).S.S(tl_W2)`

export const ARGENTUM_MAPKEY =
  `S.S.S.S.S.S.S.S.S.S.S.S
  +S.S.G5.D.C6.S.S.S.S.S.S.S
  +S(br_S2).F8.M4.F5.J9.S(bl_*3).C6.S.S.S.S.S.S
  -S.J12.C3.G6.J9.M4.M11.S.S.S.S
  -S.G8.G4.M10.C12.M6.M5.S.S.S.S
  -S.S.F2.C6.F10.G4.M11.S.S.S
  +S.D.G10.G10.J8.J3.S.S.S
  +S(r_L2).C8.F11.F10.J4.C6.S(bl_*3).S.S
  -S.J9.D.C6.M5.J2.J4.S.S
  +S.J6.G2.C5.J3.M8.F9.S.S
  -S.G11.M11.M12.F12.M11.C5.S.S
  +S(r_B2).M4.F9.J4.F12.S.S.S.S
  -S.M4.G5.C10.D.S(tl_*3).S.S.S
  +S.F8.J12.C3.S.S.S.S.S
  -S.S(r_O2).F10.F2.M9.S.S.S
  +S.F9.G12.G2.S.S.S
  -S.S.F2.J8.G3.S(l_*3).S
  +S.G10.F3.C2.S.S.S.S
  -S.S(r_W2).G9.G10.S.S.J9.C3.S
  +S.S.C11.M8.S.S.S.S
  -S.S.S.J5.C5.S.S.S
  +S.S.S.S(tl_*3).S.S`
