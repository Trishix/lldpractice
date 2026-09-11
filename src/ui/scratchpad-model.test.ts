import { describe, expect, it } from "vitest";
import { addCanvasItem, emptyCanvas, removeCanvasItem, updateCanvasItem } from "./scratchpad-model";

const note = { id: "note-1", kind: "note" as const, x: 10, y: 20, width: 200, height: 100, text: "Board owns state", color: "yellow" as const };
describe("scratchpad canvas model", () => {
  it("adds, updates, and removes bounded items", () => {
    const added = addCanvasItem(emptyCanvas(), note);
    expect(added.items).toHaveLength(1);
    expect(updateCanvasItem(added, note.id, { x: 40 }).items[0].x).toBe(40);
    expect(removeCanvasItem(added, note.id).items).toEqual([]);
  });
  it("keeps the canvas bounded to the latest 120 items", () => {
    const state = Array.from({ length: 121 }, (_, index) => ({ ...note, id: `note-${index}` })).reduce(addCanvasItem, emptyCanvas());
    expect(state.items).toHaveLength(120);
    expect(state.items[0].id).toBe("note-1");
  });
});
