import { createDispatchHook, createSelectorHook } from "react-redux";
import { reduxContext } from "@/store/redux-context";
import type { AppDispatch, RootState } from "@/store";

export const useAppDispatch = createDispatchHook(reduxContext).withTypes<AppDispatch>();
export const useAppSelector = createSelectorHook(reduxContext).withTypes<RootState>();
