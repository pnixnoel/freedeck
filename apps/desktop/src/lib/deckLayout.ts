export const TEMPO_COLUMN_WIDTH_PX = 68;
export const DECK_GRID_GAP_PX = 16;

export function deckGridColumns(side: "left" | "right"): string {
  return side === "left"
    ? `1fr ${TEMPO_COLUMN_WIDTH_PX}px`
    : `${TEMPO_COLUMN_WIDTH_PX}px 1fr`;
}
