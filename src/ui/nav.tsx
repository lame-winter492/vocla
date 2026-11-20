import { createContext, useContext } from "react";
import type { ID } from "../lib/types";

export type Route =
  | { name: "decks" }
  | { name: "overview"; did: ID }
  | { name: "study"; did: ID }
  | { name: "add"; did?: ID }
  | { name: "browse"; query?: string }
  | { name: "stats"; did?: ID }
  | { name: "notetypes" }
  | { name: "options"; did: ID }
  | { name: "filtered"; did?: ID; search?: string; search2?: string; resched?: boolean }
  | { name: "custom"; did: ID }
  | { name: "import" }
  | { name: "export"; did?: ID }
  | { name: "prefs" }
  | { name: "courses" }
  | { name: "course"; id: string }
  | { name: "lesson"; courseId: string; lessonId: string };

export interface NavCtx {
  go: (r: Route) => void;
  toast: (msg: string) => void;
  route: Route;
}

export const Nav = createContext<NavCtx>({ go: () => {}, toast: () => {}, route: { name: "decks" } });
export const useNav = () => useContext(Nav);
