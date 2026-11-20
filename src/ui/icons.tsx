// Icons: Lucide (https://lucide.dev, ISC licence), the closest open set to SF Symbols' line style.
// Only the icons imported here end up in the bundle.
// iOS menus put the symbol after the label, aligned on the trailing edge.
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleEllipsis,
  CirclePause,
  Ellipsis,
  EyeOff,
  Flag,
  FlagOff,
  GraduationCap,
  Info,
  LayoutGrid,
  Library,
  List,
  Lock,
  Pencil,
  Plus,
  Search,
  Share,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  Star,
  StarOff,
  Trash2,
  Undo2,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";

const g = (I: LucideIcon, size = 18, stroke = 1.9) => <I className="glyph" size={size} strokeWidth={stroke} aria-hidden="true" />;

/** Symbols for menus, rows and small buttons. */
export const GLYPH = {
  open: g(SquareArrowOutUpRight),
  rename: g(Pencil),
  edit: g(Pencil),
  options: g(SlidersHorizontal),
  export: g(Share),
  trash: g(Trash2),
  check: g(Check),
  up: g(ChevronUp, 14, 2.2),
  down: g(ChevronDown, 14, 2.2),
  grid: g(LayoutGrid),
  list: g(List),
  more: g(CircleEllipsis, 20),
  ellipsis: g(Ellipsis, 20),
  select: g(CircleCheck),
  suspend: g(CirclePause),
  flag: g(Flag),
  unflag: g(FlagOff),
  star: g(Star),
  unstar: g(StarOff),
  starSmall: g(Star, 13, 2.2),
  info: g(Info),
  hide: g(EyeOff),
  undo: g(Undo2),
  sound: g(Volume2),
  soundSmall: g(Volume2, 16, 2),
  close: g(X, 20, 2.1),
  closeSmall: g(X, 14, 2.2),
  chevron: g(ChevronRight, 14, 2.2),
  arrowRight: g(ArrowRight, 18, 2.2),
  arrowLeft: g(ArrowLeft, 14, 2.2),
  done: g(CircleCheck, 20, 2),
  todo: g(Circle, 20, 1.8),
  locked: g(Lock, 18, 1.9),
};

/** Tab bar and toolbar symbols (sized by CSS). */
const t = (I: LucideIcon) => <I width={20} height={20} strokeWidth={1.8} aria-hidden="true" />;
export const TAB_ICONS = {
  today: t(CalendarCheck),
  courses: t(GraduationCap),
  browse: t(Library),
  stats: t(ChartColumn),
  more: t(Ellipsis),
  search: t(Search),
  undo: t(Undo2),
  back: t(ChevronLeft),
  plus: t(Plus),
};

/** A stable hue for a name, so a deck or course keeps its colour (like Safari's monogram icons). */
export function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Rounded-square tile with a letter or two, coloured from the name. */
export function Monogram({ name, text, size }: { name: string; text?: string; size?: "sm" | "lg" }) {
  const label = (text ?? name.trim().charAt(0)).toUpperCase() || "?";
  return (
    <span className={`monogram${size ? ` ${size}` : ""}`} style={{ ["--h" as string]: hueOf(name) }} aria-hidden="true">
      {label}
    </span>
  );
}
