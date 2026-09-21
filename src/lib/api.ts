import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { tagCatalogResponse, tagSuggestionsResponse } from "../../shared/tags";
import {
  eventSchema,
  calendarResponse,
  eventsResponse,
  facetsResponse,
  listingSchema,
  listingsResponse,
  sourcesResponse,
} from "../../shared/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const headers = new Headers(options?.headers);
  if (
    options?.method &&
    !["GET", "HEAD"].includes(options.method.toUpperCase())
  ) {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!csrf.ok)
      throw new ApiError(
        "Unable to establish a secure session. Please try again.",
        csrf.status,
      );
    const { token } = z.object({ token: z.string() }).parse(await csrf.json());
    headers.set("X-CSRF-Token", token);
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch("/api" + path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body);
    throw new ApiError(
      parsed.success ? parsed.data.error : "Request failed.",
      response.status,
    );
  }
  return schema.parse(body);
}
export function mutate<T>(
  path: string,
  schema: z.ZodType<T>,
  body: unknown = {},
  method = "POST",
) {
  return request(path, schema, { method, body: JSON.stringify(body) });
}
export const queries = {
  tags: queryOptions({
    queryKey: ["tags"],
    queryFn: ({ signal }) => request("/tags", tagCatalogResponse, { signal }),
  }),
  tagSuggestions: (status = "pending") =>
    queryOptions({
      queryKey: ["private", "tag-suggestions", status],
      queryFn: ({ signal }) =>
        request(
          "/tags/suggestions?status=" + encodeURIComponent(status),
          tagSuggestionsResponse,
          { signal },
        ),
    }),
  listings: (params: string) =>
    queryOptions({
      queryKey: ["listings", params],
      queryFn: ({ signal }) =>
        request("/listings?" + params, listingsResponse, { signal }),
    }),
  listing: (id: string) =>
    queryOptions({
      queryKey: ["listing", id],
      queryFn: ({ signal }) =>
        request("/listings/" + encodeURIComponent(id), listingSchema, {
          signal,
        }),
    }),
  events: (params: string) =>
    queryOptions({
      refetchInterval: 60000,
      queryKey: ["events", params],
      queryFn: ({ signal }) =>
        request("/events?" + params, eventsResponse, { signal }),
    }),
  event: (id: string) =>
    queryOptions({
      queryKey: ["event", id],
      queryFn: ({ signal }) =>
        request("/events/" + encodeURIComponent(id), eventSchema, { signal }),
    }),
  calendar: (params: string) =>
    queryOptions({
      queryKey: ["calendar", params],
      refetchInterval: 60000,
      queryFn: ({ signal }) =>
        request("/events/calendar?" + params, calendarResponse, { signal }),
    }),
  facets: queryOptions({
    queryKey: ["facets"],
    queryFn: ({ signal }) =>
      request("/listings/facets", facetsResponse, { signal }),
  }),
  sources: queryOptions({
    refetchInterval: 60000,
    queryKey: ["sources"],
    queryFn: ({ signal }) => request("/meta", sourcesResponse, { signal }),
  }),
};
