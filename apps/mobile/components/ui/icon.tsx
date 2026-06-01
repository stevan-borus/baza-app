/**
 * Central icon component — the single source of truth for app iconography.
 *
 * The whole app went from a FontAwesome + Feather mix (@expo/vector-icons) to
 * lucide-react-native. To avoid churning ~40 call sites and the unit tests'
 * `data-icon="<name>"` assertions, the `name` prop keeps the legacy semantic
 * strings (e.g. "clock-o", "th-large", "map-marker") and this table is the one
 * place that maps them to a Lucide glyph. Rename keys to cleaner semantics in a
 * separate pass if ever — it would touch every call site and test.
 */
import React from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import {
  type LucideIcon,
  AlertTriangle,
  Ban,
  BarChart3,
  Bell,
  Calendar,
  Camera,
  CameraOff,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  CreditCard,
  DollarSign,
  Edit2,
  Eye,
  EyeOff,
  AlertCircle,
  Gift,
  Home,
  Inbox,
  Info,
  Link,
  List,
  Lock,
  MapPin,
  Smartphone,
  StickyNote,
  Moon,
  Package,
  Pause,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Repeat,
  LogIn,
  LogOut,
  Sun,
  LayoutGrid,
  User,
  Users,
  Wifi,
  X,
  Settings,
  Trash2,
  Search,
  Filter,
  Mail,
  Archive,
} from "lucide-react-native";

const ICONS = {
  "alert-triangle": AlertTriangle,
  ban: Ban,
  "bar-chart": BarChart3,
  bell: Bell,
  calendar: Calendar,
  camera: Camera,
  "camera-off": CameraOff,
  check: Check,
  "check-circle": CheckCircle,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  // FontAwesome's hollow circle ("circle-o") — Lucide's outline Circle.
  "circle-o": Circle,
  "clock-o": Clock,
  "credit-card": CreditCard,
  "dollar-sign": DollarSign,
  "edit-2": Edit2,
  eye: Eye,
  "eye-off": EyeOff,
  "exclamation-circle": AlertCircle,
  gift: Gift,
  home: Home,
  inbox: Inbox,
  "info-circle": Info,
  link: Link,
  list: List,
  "sticky-note-o": StickyNote,
  lock: Lock,
  mail: Mail,
  "map-marker": MapPin,
  mobile: Smartphone,
  "moon-o": Moon,
  package: Package,
  pause: Pause,
  pencil: Pencil,
  phone: Phone,
  plus: Plus,
  refresh: RefreshCw,
  repeat: Repeat,
  "sign-in": LogIn,
  "sign-out": LogOut,
  "sun-o": Sun,
  "th-large": LayoutGrid,
  // FontAwesome's "times" is the close/X glyph.
  times: X,
  trash: Trash2,
  "trash-2": Trash2,
  user: User,
  users: Users,
  wifi: Wifi,
  x: X,
  cog: Settings,
  search: Search,
  filter: Filter,
  envelope: Mail,
  archive: Archive,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  /** Lucide stroke weight. Default 2 matches the previous thin Feather chrome. */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
  testID?: string;
};

export function Icon({
  name,
  size = 22,
  color,
  strokeWidth = 2,
  style,
  className,
  testID,
}: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={style}
      className={className}
      testID={testID}
    />
  );
}
