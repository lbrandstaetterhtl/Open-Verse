import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

let csrfToken: string | null = null;

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Try to fetch CSRF token if we don't have one and this is a mutation
  if (!csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    try {
      const r = await fetch("/api/csrf-token");
      if (r.ok) {
        const d = await r.json();
        csrfToken = d.csrfToken;
      }
    } catch (e) {
      console.error("Failed to fetch CSRF token", e);
    }
  }

  const doRequest = async () => {
    const isFormData = data instanceof FormData;
    const headers: Record<string, string> = {
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    };

    if (data && !isFormData) {
      headers["Content-Type"] = "application/json";
    }

    return fetch(url, {
      method,
      headers,
      body: isFormData ? (data as FormData) : data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  };

  let res = await doRequest();

  // Retry on 403 Invalid CSRF Token
  if (res.status === 403) {
    const text = await res.clone().text(); // Clone to read text safely
    if (text.includes("Invalid CSRF Token")) {
      console.log("CSRF Token invalid, retrying...");
      csrfToken = null; // Clear stale token

      // Fetch new token
      try {
        const r = await fetch("/api/csrf-token");
        if (r.ok) {
          const d = await r.json();
          csrfToken = d.csrfToken;
        }
      } catch (e) {
        console.error("Failed to refresh CSRF token", e);
      }

      // Retry request
      res = await doRequest();
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
