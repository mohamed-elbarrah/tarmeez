import { createContext } from "react";
import type { ReactReduxContextValue } from "react-redux";
/** Explicitly shared context keeps the Provider and RTK Query hooks bound to the same instance. */
export const reduxContext = createContext<ReactReduxContextValue | null>(null);
