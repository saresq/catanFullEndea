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
  -S(br_*3).F5.F10.G6.S
  -S.M8.F3.C12.C9.S(l_W2)
  -S(r_*3).C4.G12.J4.F8.J10.S
  -S.M6.C2.J6.D.M11.G3.S(l_*3)
  +S(r_O2).J4.F11.G2.C9.G5.S
  +S.D.M8.J10.J11.S(l_B2)
  +S(tr_S2).F3.G5.M9.S
  +S.S(tr_L2).S.S(tl_*3)`

// 7-8 players: 42 land hexes (8/8/8/7/8, 3 deserts), 39 discs, 13 ports (8 generic), laid out as a
// tidy shape: symmetric across both axes
export const DEFAULT_MAPKEY_7_8 =
  `S.S.S(bl_*3).S.S(bl_B2).S.S(bl_*3).S.S
  -S.S(br_S2).J5.G9.J4.G3.G8.S.S
  +S.C2.F6.M12.C8.M10.M2.S(l_*3).S
  -S(r_L2).D.J10.G11.C4.C9.M12.J9.S
  +S.F8.J12.F3.C2.J5.G6.S(l_*3).S
  -S(r_*3).G11.F4.J2.M4.F8.C10.F11.S
  +S.F6.G9.D.J5.M11.C5.S(tl_*3).S
  -S.S(tr_W2).F3.M12.G6.C3.D.S.S
  +S.S.S(tr_O2).S.S(tr_*3).S.S(tl_*3).S.S`

// 9-10 players: 52 land hexes (10/10/9/9/10, 4 deserts), 48 discs, 14 ports (9 generic), laid out as a
// tidy shape: symmetric across both axes
export const DEFAULT_MAPKEY_9_10 =
  `S.S(br_*3).S.S(br_*3).S.S.S(bl_*3).S.S(bl_W2).S
  +S.F6.J2.C8.G2.D.G2.F8.S.S
  -S(r_L2).C4.M11.G5.J9.C11.G5.F4.C2.S(l_*3)
  +S.F8.M12.J6.F2.G9.M6.M11.S.S
  -S(r_*3).G9.F10.M9.D.C11.G12.G5.G3.S(l_*3)
  +S.J8.C5.J4.C5.M9.J3.M8.S.S
  -S(r_S2).F3.D.J6.C3.C6.F10.D.J10.S(l_O2)
  +S.J10.J12.F11.C4.M12.F3.M4.S.S
  -S.S(tr_*3).S.S(tr_*3).S.S.S(tl_B2).S.S(tl_*3).S`

export const ARGENTUM_MAPKEY =
  `S.S.S(br_*3).S.S.S(bl_*3).S.S.S
  +S.S.F3.J11.C3.S.S.S.S
  -S.S(br_*3).F5.D.G6.F5.S(bl_B2).F3.S
  +S.M10.M6.G12.F9.F12.G4.S.S
  -S(r_*3).C6.F3.F2.J5.F6.C2.S.S
  +S.M12.F9.G8.J3.D.S(l_*3).S.S
  -S.M5.C11.C5.M10.G6.S.S.S
  +S(r_*3).C6.F4.J11.F5.M9.S(bl_S2).S.S
  -S.M9.G3.M2.J4.G11.F8.S.S
  +S.J4.D.G8.M3.F9.C11.S.S
  -S.C2.G12.C9.J4.G8.M10.S.S
  +S(r_W2).F10.M2.C8.J12.S.S.S.S
  -S.G11.J8.J10.C3.S(tl_O2).S.S.S
  +S.D.C11.M6.S.S.S.S.S
  -S.S(r_L2).G6.J10.C12.S.S.S.S
  +S.J5.M2.C4.S.S.S.S.S
  -S.S.C9.F8.G2.S(l_*3).S.S.S
  +S.J4.G2.G11.S.S.S.S.S
  -S.S(r_*3).M5.J12.S.S.J12.M10.S
  +S.S.C9.G4.S.S.S.S.S
  -S.S.S.M8.J10.S.S.S.S
  +S.S.S.S(tl_*3).S.S.S.S.S`
