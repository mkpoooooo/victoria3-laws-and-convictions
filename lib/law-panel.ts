export type LawPanelState = { open: boolean; openings: number; autoClosed: boolean };
export const closedLawPanel: LawPanelState = { open: false, openings: 0, autoClosed: false };

export function toggleLawPanel(state: LawPanelState): LawPanelState {
  return { ...state, open: !state.open, openings: state.open ? state.openings : state.openings + 1 };
}

export function completeLawPanel(state: LawPanelState, complete: boolean): LawPanelState {
  if (!complete || !state.open || state.openings !== 1 || state.autoClosed) return state;
  return { ...state, open: false, autoClosed: true };
}
