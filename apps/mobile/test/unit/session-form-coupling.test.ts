import { describe, expect, it } from "vitest";
import { applySessionFormChange } from "@/lib/admin/session-form-state";

const classTypes = [
  { id: "ct-reformer", durationMins: 60, maxClients: 6 },
  { id: "ct-energy", durationMins: 45, maxClients: 12 },
];
const rooms = [
  { id: "room-a", capacity: 6 },
  { id: "room-b", capacity: 12 },
];

const initial = {
  classTypeId: "",
  durationMins: "",
  capacity: "",
  roomId: "",
  trainerUserId: "",
  startsAt: null as Date | null,
};

describe("session form field coupling", () => {
  it("picking a ClassType sets duration and capacity from its defaults", () => {
    const next = applySessionFormChange(initial, { field: "classTypeId", value: "ct-reformer" }, { classTypes, rooms });
    expect(next.durationMins).toBe("60");
    expect(next.capacity).toBe("6");
  });

  it("picking a Sala overwrites capacity with that Sala's capacity (first time)", () => {
    const after = applySessionFormChange(initial, { field: "roomId", value: "room-a" }, { classTypes, rooms });
    expect(after.capacity).toBe("6");
    expect(after.roomId).toBe("room-a");
  });

  it("picking a different Sala overwrites capacity (subsequent change — fixes #4)", () => {
    const first = applySessionFormChange(initial, { field: "roomId", value: "room-a" }, { classTypes, rooms });
    const second = applySessionFormChange(first, { field: "roomId", value: "room-b" }, { classTypes, rooms });
    expect(second.capacity).toBe("12");
    expect(second.roomId).toBe("room-b");
  });

  it("Sala overrides ClassType capacity when picked after ClassType", () => {
    const withClass = applySessionFormChange(initial, { field: "classTypeId", value: "ct-energy" }, { classTypes, rooms });
    expect(withClass.capacity).toBe("12");
    const withRoom = applySessionFormChange(withClass, { field: "roomId", value: "room-a" }, { classTypes, rooms });
    expect(withRoom.capacity).toBe("6");
  });

  it("editing capacity directly leaves it as-is", () => {
    const typed = applySessionFormChange(initial, { field: "capacity", value: "8" }, { classTypes, rooms });
    expect(typed.capacity).toBe("8");
  });
});
