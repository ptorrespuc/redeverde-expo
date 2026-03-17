export function jsonError(message: string, status = 400, details?: unknown) {
  return Response.json(
    {
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    { status },
  );
}
