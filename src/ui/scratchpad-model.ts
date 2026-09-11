export type CanvasItemKind = "note" | "box" | "arrow";
export type CanvasColor = "yellow" | "blue" | "pink" | "white";
export interface CanvasItem {
  id: string;
  kind: CanvasItemKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: CanvasColor;
  fromId?: string;
  toId?: string;
}
export interface ScratchpadCanvasState { items: CanvasItem[]; scale: number; offsetX: number; offsetY: number }
export const emptyCanvas = (): ScratchpadCanvasState => ({ items: [], scale: 1, offsetX: 0, offsetY: 0 });
export function addCanvasItem(state: ScratchpadCanvasState, item: CanvasItem): ScratchpadCanvasState {
  return { ...state, items: [...state.items, item].slice(-120) };
}
export function updateCanvasItem(state: ScratchpadCanvasState, id: string, patch: Partial<CanvasItem>): ScratchpadCanvasState {
  return { ...state, items: state.items.map(item => item.id === id ? { ...item, ...patch } : item) };
}
export function removeCanvasItem(state: ScratchpadCanvasState, id: string): ScratchpadCanvasState {
  return { ...state, items: state.items.filter(item => item.id !== id) };
}
export function resetCanvas(): ScratchpadCanvasState { return emptyCanvas(); }
