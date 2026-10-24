/** Spacing scale in points. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  jumbo: 64,
} as const;

/** Rules and corners. Square corners everywhere except swatches and avatars. */
export const borders = {
  /** 1 pt rules and outlines. */
  hairline: 1,
  /** The 2 pt rule under the masthead. */
  masthead: 2,
  radius: {
    none: 0,
    /** For circles (swatches, avatars); clamps to half the side. */
    round: 9999,
  },
} as const;

/** Fixed sizes from the design. */
export const sizes = {
  /** Horizontal screen padding. */
  screenPadding: 20,
  buttonHeight: 52,
  chipHeight: 36,
  /** Chip side padding (Closet.dc.html filters, SaveItem.dc.html chips: 0 14px). */
  chipPaddingHorizontal: 14,
  /** Minimum touch target; smaller elements get hit slop up to this. */
  minTouchTarget: 44,
  maxContentWidth: 800,
  /** Photo area of a closet tile (Closet.dc.html). */
  closetTileHeight: 200,
  /** Photo area at the top of the item screen (ItemDetail.dc.html), below the status bar. */
  itemPhotoHeight: 340,
  /** The large photo in the Add/Edit form (Angles.dc.html). */
  formPhotoHeight: 330,
  /** The angle thumbnails and the "Add another angle" tile under it (Angles.dc.html). */
  angleTileHeight: 120,
  /** A photo in the import review list (Gate 2 slice 6; no mockup, 4:5 like a closet tile). */
  importThumbnailWidth: 88,
  importThumbnailHeight: 110,
  /** Color circles in an import review row. */
  importSwatchSize: 14,
  /** Color circles in the Add/Edit form's color chips (SaveItem.dc.html). */
  formSwatchSize: 26,
  /** Color circles in the color matrix (ColorMatrix.dc.html). */
  matrixSwatchSize: 46,
  /** Color circles in the matrix's list of chosen colors. */
  chosenSwatchSize: 28,
  /** The Style screen's request box: room for three lines of serif text (StylePrompt.dc.html rows="3"). */
  styleRequestMinHeight: 104,
  /** A look's main photos on Results (no mockup; Results.dc.html's photo area is 310): one, two or three across. */
  lookPhotoHeightOne: 300,
  lookPhotoHeightTwo: 230,
  lookPhotoHeightThree: 170,
  /** Shoes and accessories in the smaller row under them. */
  lookSmallPhotoSize: 76,
} as const;

/** Opacity of disabled controls (exempt from contrast minimums, WCAG 1.4.3). */
export const opacity = {
  disabled: 0.4,
  /** Pressed photo tiles (closet grid). */
  pressed: 0.7,
  /** The dimmed backdrop behind a modal card (Permission.dc.html: 0.6). */
  scrim: 0.6,
} as const;
