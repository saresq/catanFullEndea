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

// 5-6 player board layout based on the official Catan 5-6 player extension
export const DEFAULT_MAPKEY_5_6 =
  `S(br_*3).S.S.S(bl_W2).S
  -S.M10.G2.J9.F6.S(bl_O2)
  -S(r_L2).F12.C6.G4.C10.M3.S
  -S.F9.J11.D.J3.M8.D.S(l_*3)
  +S(r_B2).J8.M3.F4.G5.C11.S
  +S.C5.F6.G11.J4.S(tl_S2)
  +S(tr_*3).S.S.S(tl_*3).S`

// 7-8 player board layout (custom larger board)
export const DEFAULT_MAPKEY_7_8 =
  `S(br_*3).S.S.S.S(bl_W2).S
  -S.M10.G2.J9.F6.C5.S(bl_O2)
  -S(r_L2).F12.C6.G4.C10.M3.D.S
  -S.F9.J11.D.J3.M8.G5.F10.S(l_*3)
  -S.G6.F3.M5.C8.J10.F11.D.S
  +S(r_B2).J8.M3.F4.G5.C11.M12.S
  +S.C5.F6.G11.J4.M2.S(tl_S2)
  +S(tr_*3).S.S.S.S(tl_*3).S`

// 9-10 player board layout (custom even larger board)
export const DEFAULT_MAPKEY_9_10 =
  `S.S.S(bl_*3).S.S(bl_*3).S.S.S
  -S(br_S2).M12.J11.G9.C4.F9.G11.S(l_L2)
  -S.M6.C2.G6.M11.C6.M3.S
  -S.C11.F3.F10.D.F5.J4.J2.S(l_O2)
  -S.S(r_B2).F6.F5.C8.G10.J5.G12.S
  +S.G5.M9.J4.M3.J2.F8.M12.S(l_*3)
  +S.M2.D.J10.F12.D.J3.S
  +S(tr_W2).C8.G9.G8.C4.C10.S
  +S.S(tr_*3).S.S.S(tl_*3).S.S.S`

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
