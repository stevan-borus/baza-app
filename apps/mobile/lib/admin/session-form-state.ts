export type SessionFormFields = {
  classTypeId: string;
  durationMins: string;
  capacity: string;
  roomId: string;
};

export type SessionFormChange =
  | { field: "classTypeId"; value: string }
  | { field: "roomId"; value: string }
  | { field: "durationMins"; value: string }
  | { field: "capacity"; value: string };

export type SessionFormLookups = {
  classTypes: { id: string; durationMins: number; maxClients: number }[];
  rooms: { id: string; capacity: number }[];
};

export function applySessionFormChange<S extends SessionFormFields>(
  prev: S,
  change: SessionFormChange,
  lookups: SessionFormLookups,
): S {
  switch (change.field) {
    case "classTypeId": {
      const ct = lookups.classTypes.find((c) => c.id === change.value);
      return {
        ...prev,
        classTypeId: change.value,
        durationMins: ct ? String(ct.durationMins) : prev.durationMins,
        capacity: ct ? String(ct.maxClients) : prev.capacity,
      };
    }
    case "roomId": {
      const room = lookups.rooms.find((r) => r.id === change.value);
      return {
        ...prev,
        roomId: change.value,
        capacity: room ? String(room.capacity) : prev.capacity,
      };
    }
    default:
      return { ...prev, [change.field]: change.value };
  }
}
