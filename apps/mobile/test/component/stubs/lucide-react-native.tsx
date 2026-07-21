/**
 * Component-test stub for `lucide-react-native`.
 *
 * The real package's ESM dist trips the dep optimizer (internal
 * missing-export), and glyphs are decorative in behavior tests anyway.
 * Exports one inert component per icon `components/ui/icon.tsx` imports —
 * an unknown-export error here means icon.tsx gained an icon: add it below.
 */
import React from "react";

export type LucideIcon = React.ComponentType<Record<string, unknown>>;

const icon = (): LucideIcon => () => null;

export const AlertTriangle = icon();
export const Ban = icon();
export const BarChart3 = icon();
export const Bell = icon();
export const Calendar = icon();
export const Camera = icon();
export const CameraOff = icon();
export const Check = icon();
export const CheckCircle = icon();
export const ChevronDown = icon();
export const ChevronLeft = icon();
export const ChevronRight = icon();
export const Circle = icon();
export const Clock = icon();
export const CreditCard = icon();
export const DollarSign = icon();
export const Edit2 = icon();
export const Eye = icon();
export const EyeOff = icon();
export const AlertCircle = icon();
export const Gift = icon();
export const Home = icon();
export const Inbox = icon();
export const Info = icon();
export const Link = icon();
export const List = icon();
export const Lock = icon();
export const MapPin = icon();
export const Megaphone = icon();
export const Smartphone = icon();
export const StickyNote = icon();
export const Moon = icon();
export const Package = icon();
export const Pause = icon();
export const Pencil = icon();
export const Phone = icon();
export const Plus = icon();
export const RefreshCw = icon();
export const Repeat = icon();
export const LogIn = icon();
export const LogOut = icon();
export const Sun = icon();
export const LayoutGrid = icon();
export const User = icon();
export const Users = icon();
export const Wifi = icon();
export const X = icon();
export const Settings = icon();
export const Trash2 = icon();
export const Search = icon();
export const Filter = icon();
export const Mail = icon();
export const Archive = icon();
export const MessageCircle = icon();
