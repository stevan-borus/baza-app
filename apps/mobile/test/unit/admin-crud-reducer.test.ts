/**
 * Unit tests for the admin CRUD state machine (lib/admin/use-admin-crud.ts) —
 * the sheet choreography shared by the katalog screens (Sale / Tipovi
 * treninga / Tipovi paketa): create-sheet, edit-sheet, delete-confirm, and
 * the close-and-reset transitions their mutations trigger on success.
 * Pure reducer, renderer-free (RTL is not installed) — the useAdminCrud hook
 * is a thin useReducer/useMutation wrapper over this machine.
 */
import { describe, expect, it } from "vitest";
import {
  adminCrudReducer,
  initialAdminCrudState,
} from "@/lib/admin/use-admin-crud";

type Form = { name: string; capacity: string };
const empty: Form = { name: "", capacity: "" };

describe("adminCrudReducer", () => {
  it("starts with all sheets closed and empty forms", () => {
    const s = initialAdminCrudState(empty);
    expect(s).toEqual({
      showCreate: false,
      editingId: null,
      confirmDelete: false,
      form: empty,
      editForm: empty,
    });
  });

  it("openCreate opens the sheet with a fresh form, even after typing", () => {
    let s = initialAdminCrudState(empty);
    s = adminCrudReducer(s, { type: "setForm", patch: { name: "Sala X" } });
    s = adminCrudReducer(s, { type: "createOpenChanged", open: false });
    s = adminCrudReducer(s, { type: "openCreate", empty });
    expect(s.showCreate).toBe(true);
    expect(s.form).toEqual(empty);
  });

  it("setForm / setEditForm patch only the given fields", () => {
    let s = initialAdminCrudState(empty);
    s = adminCrudReducer(s, { type: "setForm", patch: { name: "Sala 1" } });
    s = adminCrudReducer(s, { type: "setEditForm", patch: { capacity: "8" } });
    expect(s.form).toEqual({ name: "Sala 1", capacity: "" });
    expect(s.editForm).toEqual({ name: "", capacity: "8" });
  });

  it("openEdit seeds the edit form from the entity and targets its id", () => {
    let s = initialAdminCrudState(empty);
    s = adminCrudReducer(s, {
      type: "openEdit",
      id: "room-1",
      form: { name: "Velika sala", capacity: "12" },
    });
    expect(s.editingId).toBe("room-1");
    expect(s.editForm).toEqual({ name: "Velika sala", capacity: "12" });
  });

  it("created closes the create sheet and resets the form", () => {
    let s = initialAdminCrudState(empty);
    s = adminCrudReducer(s, { type: "openCreate", empty });
    s = adminCrudReducer(s, { type: "setForm", patch: { name: "Sala 2" } });
    s = adminCrudReducer(s, { type: "created", empty });
    expect(s.showCreate).toBe(false);
    expect(s.form).toEqual(empty);
  });

  it("updated closes the edit sheet", () => {
    let s = initialAdminCrudState(empty);
    s = adminCrudReducer(s, { type: "openEdit", id: "r1", form: empty });
    s = adminCrudReducer(s, { type: "updated" });
    expect(s.editingId).toBeNull();
  });

  it("askDelete stacks the confirm on top of the edit sheet; deleted closes both", () => {
    let s = initialAdminCrudState(empty);
    s = adminCrudReducer(s, { type: "openEdit", id: "r1", form: empty });
    s = adminCrudReducer(s, { type: "askDelete" });
    expect(s.confirmDelete).toBe(true);
    expect(s.editingId).toBe("r1");
    s = adminCrudReducer(s, { type: "deleted" });
    expect(s.confirmDelete).toBe(false);
    expect(s.editingId).toBeNull();
  });

  it("dismissing the confirm keeps the edit sheet open", () => {
    let s = initialAdminCrudState(empty);
    s = adminCrudReducer(s, { type: "openEdit", id: "r1", form: empty });
    s = adminCrudReducer(s, { type: "askDelete" });
    s = adminCrudReducer(s, { type: "deleteOpenChanged", open: false });
    expect(s.confirmDelete).toBe(false);
    expect(s.editingId).toBe("r1");
  });

  it("editOpenChanged(false) clears the edit target", () => {
    let s = initialAdminCrudState(empty);
    s = adminCrudReducer(s, { type: "openEdit", id: "r1", form: empty });
    s = adminCrudReducer(s, { type: "editOpenChanged", open: false });
    expect(s.editingId).toBeNull();
  });
});
