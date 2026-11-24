const UUID_ROUTE_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function safeUuidRouteSegment(value: string): string | null {
  const segment = value.trim();
  return UUID_ROUTE_SEGMENT.test(segment) ? encodeURIComponent(segment) : null;
}
