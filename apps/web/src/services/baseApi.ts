import { buildCreateApi, coreModule, fetchBaseQuery, reactHooksModule } from "@reduxjs/toolkit/query/react";
import { createDispatchHook, createSelectorHook, createStoreHook } from "react-redux";
import { reduxContext } from "@/store/redux-context";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { clearCredentials, setCredentials } from "@/store/slices/authSlice";
import type { RootState } from "@/store";

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
if (!configuredBaseUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is required. Set it in apps/web/.env.local.");
}
const parsedBaseUrl = new URL(configuredBaseUrl);
if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
  throw new Error("NEXT_PUBLIC_API_URL must use http or https.");
}
const baseUrl = configuredBaseUrl;
const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${baseUrl.replace(/\/$/, "")}/`,
  credentials: "include",
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set("authorization", `Bearer ${token}`);
    headers.set("accept", "application/json");
    return headers;
  },
});

let refreshPromise: Promise<{ accessToken: string } | null> | null = null;
const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  const requestUrl = typeof args === "string" ? args : args.url;
  const isAuthRoute = requestUrl.startsWith("auth/");
  const isSessionBootstrapRoute = requestUrl === "auth/me";
  if (result.error?.status === 401 && requestUrl !== "auth/refresh" && (!isAuthRoute || isSessionBootstrapRoute)) {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const refreshed = await rawBaseQuery({ url: "auth/refresh", method: "POST" }, api, extraOptions);
        const accessToken = (refreshed.data as { data?: { accessToken?: string } } | undefined)?.data?.accessToken;
        if (typeof accessToken === "string") {
          api.dispatch(setCredentials({ accessToken }));
          return { accessToken };
        }
        api.dispatch(clearCredentials());
        return null;
      })().finally(() => { refreshPromise = null; });
    }
    const refreshed = await refreshPromise;
    if (refreshed) result = await rawBaseQuery(args, api, extraOptions);
  }
  return result;
};

const createApi = buildCreateApi(
  coreModule(),
  reactHooksModule({
    hooks: {
      useDispatch: createDispatchHook(reduxContext),
      useSelector: createSelectorHook(reduxContext),
      useStore: createStoreHook(reduxContext),
    },
  }),
);

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Auth"],
  endpoints: () => ({}),
});
