/**
 * The admin CRUD machine — the sheet choreography every katalog editor
 * (Sale / Tipovi treninga / Tipovi paketa) used to copy by hand: a create
 * sheet, an edit sheet opened per row, a delete confirm stacked on the edit
 * sheet, and the close-and-reset transitions their mutations fire on success.
 *
 * The machine itself is a pure reducer (unit-tested renderer-free);
 * `useAdminCrud` is the thin wrapper that owns the state and injects the
 * close-on-success choreography around the factory-provided mutation options.
 * Screens keep their own JSX — inputs, sheets, layout — and read/drive the
 * machine through the returned handlers. Cache upkeep stays in the factory
 * options per the project convention; this hook only appends UI transitions.
 */
import { useReducer } from "react";
import {
  useMutation,
  type UseMutationOptions,
} from "@tanstack/react-query";

export type AdminCrudState<F> = {
  showCreate: boolean;
  editingId: string | null;
  confirmDelete: boolean;
  form: F;
  editForm: F;
};

export type AdminCrudAction<F> =
  | { type: "openCreate"; empty: F }
  | { type: "createOpenChanged"; open: boolean }
  | { type: "setForm"; patch: Partial<F> }
  | { type: "openEdit"; id: string; form: F }
  | { type: "editOpenChanged"; open: boolean }
  | { type: "setEditForm"; patch: Partial<F> }
  | { type: "askDelete" }
  | { type: "deleteOpenChanged"; open: boolean }
  | { type: "created"; empty: F }
  | { type: "updated" }
  | { type: "deleted" };

export function initialAdminCrudState<F>(empty: F): AdminCrudState<F> {
  return {
    showCreate: false,
    editingId: null,
    confirmDelete: false,
    form: empty,
    editForm: empty,
  };
}

export function adminCrudReducer<F>(
  state: AdminCrudState<F>,
  action: AdminCrudAction<F>,
): AdminCrudState<F> {
  switch (action.type) {
    case "openCreate":
      return { ...state, showCreate: true, form: action.empty };
    case "createOpenChanged":
      return { ...state, showCreate: action.open };
    case "setForm":
      return { ...state, form: { ...state.form, ...action.patch } };
    case "openEdit":
      return { ...state, editingId: action.id, editForm: action.form };
    case "editOpenChanged":
      return action.open ? state : { ...state, editingId: null };
    case "setEditForm":
      return { ...state, editForm: { ...state.editForm, ...action.patch } };
    case "askDelete":
      return { ...state, confirmDelete: true };
    case "deleteOpenChanged":
      return { ...state, confirmDelete: action.open };
    case "created":
      return { ...state, showCreate: false, form: action.empty };
    case "updated":
      return { ...state, editingId: null };
    case "deleted":
      return { ...state, confirmDelete: false, editingId: null };
  }
}

type AnyMutationOptions<TData, TVariables> = UseMutationOptions<
  TData,
  Error,
  TVariables
>;

export function useAdminCrud<
  F,
  E extends { id: string },
  TCreate,
  CV,
  TUpdate,
  UV,
  TDelete,
  DV,
>(config: {
  empty: F;
  toForm: (entity: E) => F;
  create: AnyMutationOptions<TCreate, CV>;
  update: AnyMutationOptions<TUpdate, UV>;
  remove: AnyMutationOptions<TDelete, DV>;
}) {
  const [state, dispatch] = useReducer(
    adminCrudReducer<F>,
    config.empty,
    initialAdminCrudState<F>,
  );

  const createMutation = useMutation(config.create);
  const updateMutation = useMutation(config.update);
  const removeMutation = useMutation(config.remove);

  const { empty, toForm } = config;

  const submitCreate = (vars: CV) =>
    createMutation.mutate(vars, {
      onSuccess: () => dispatch({ type: "created", empty }),
    });
  const submitUpdate = (vars: UV) =>
    updateMutation.mutate(vars, {
      onSuccess: () => dispatch({ type: "updated" }),
    });
  const submitDelete = (vars: DV) =>
    removeMutation.mutate(vars, {
      onSuccess: () => dispatch({ type: "deleted" }),
    });

  return {
    ...state,
    openCreate: () => dispatch({ type: "openCreate", empty }),
    onCreateOpenChange: (open: boolean) =>
      dispatch({ type: "createOpenChanged", open }),
    setForm: (patch: Partial<F>) => dispatch({ type: "setForm", patch }),
    openEdit: (entity: E) =>
      dispatch({ type: "openEdit", id: entity.id, form: toForm(entity) }),
    onEditOpenChange: (open: boolean) =>
      dispatch({ type: "editOpenChanged", open }),
    setEditForm: (patch: Partial<F>) =>
      dispatch({ type: "setEditForm", patch }),
    askDelete: () => dispatch({ type: "askDelete" }),
    onDeleteOpenChange: (open: boolean) =>
      dispatch({ type: "deleteOpenChanged", open }),
    submitCreate,
    submitUpdate,
    submitDelete,
    createMutation,
    updateMutation,
    removeMutation,
  };
}
