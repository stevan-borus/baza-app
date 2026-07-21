/**
 * Component-test stub for `lucide-react-native`.
 *
 * The real package's ESM dist trips the dep optimizer (internal
 * missing-export), and glyphs are decorative in behavior tests anyway.
 * Exports one inert component per icon `components/ui/icon.tsx` imports —
 * an unknown-export error here means icon.tsx gained an icon: add it below.
 */
import React from "react";
import { View } from "react-native";

export type LucideIcon = React.ComponentType<Record<string, unknown>>;

/** Each glyph renders an inert marker carrying its name, so tests can
 * assert an icon's presence/absence without real SVG. */
const icon = (name: string): LucideIcon =>
  function LucideStub() {
    return <View testID={`lucide-${name}`} />;
  };

export const AlertTriangle = icon("AlertTriangle");
export const Ban = icon("Ban");
export const BarChart3 = icon("BarChart3");
export const Bell = icon("Bell");
export const Calendar = icon("Calendar");
export const Camera = icon("Camera");
export const CameraOff = icon("CameraOff");
export const Check = icon("Check");
export const CheckCircle = icon("CheckCircle");
export const ChevronDown = icon("ChevronDown");
export const ChevronLeft = icon("ChevronLeft");
export const ChevronRight = icon("ChevronRight");
export const Circle = icon("Circle");
export const Clock = icon("Clock");
export const CreditCard = icon("CreditCard");
export const DollarSign = icon("DollarSign");
export const Edit2 = icon("Edit2");
export const Eye = icon("Eye");
export const EyeOff = icon("EyeOff");
export const AlertCircle = icon("AlertCircle");
export const Gift = icon("Gift");
export const Home = icon("Home");
export const Inbox = icon("Inbox");
export const Info = icon("Info");
export const Link = icon("Link");
export const List = icon("List");
export const Lock = icon("Lock");
export const MapPin = icon("MapPin");
export const Megaphone = icon("Megaphone");
export const Smartphone = icon("Smartphone");
export const StickyNote = icon("StickyNote");
export const Moon = icon("Moon");
export const Package = icon("Package");
export const Pause = icon("Pause");
export const Pencil = icon("Pencil");
export const Phone = icon("Phone");
export const Plus = icon("Plus");
export const RefreshCw = icon("RefreshCw");
export const Repeat = icon("Repeat");
export const LogIn = icon("LogIn");
export const LogOut = icon("LogOut");
export const Sun = icon("Sun");
export const LayoutGrid = icon("LayoutGrid");
export const User = icon("User");
export const Users = icon("Users");
export const Wifi = icon("Wifi");
export const X = icon("X");
export const Settings = icon("Settings");
export const Trash2 = icon("Trash2");
export const Search = icon("Search");
export const Filter = icon("Filter");
export const Mail = icon("Mail");
export const Archive = icon("Archive");
export const MessageCircle = icon("MessageCircle");
