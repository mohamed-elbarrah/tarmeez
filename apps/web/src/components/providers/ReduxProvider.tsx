"use client";

import { Provider } from "react-redux";
import type { ReactNode } from "react";
import { store } from "@/store";
import { reduxContext } from "@/store/redux-context";

interface ReduxProviderProps { children: ReactNode }

export function ReduxProvider({ children }: ReduxProviderProps) {
  return <Provider store={store} context={reduxContext}>{children}</Provider>;
}
