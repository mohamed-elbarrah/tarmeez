import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/services/baseApi";
import authReducer from "@/store/slices/authSlice";

export const store = configureStore({
  reducer: { auth: authReducer, [baseApi.reducerPath]: baseApi.reducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
