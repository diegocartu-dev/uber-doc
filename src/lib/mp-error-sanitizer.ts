type MpErrorResponse = {
  status: number;
  error?: string;
  message?: string;
  cause?: Array<{ code: string; description?: string }>;
};

export function sanitizeMpError(
  status: number,
  body: unknown
): MpErrorResponse {
  const safe: MpErrorResponse = { status };

  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") safe.error = b.error.slice(0, 100);
    if (typeof b.message === "string") safe.message = b.message.slice(0, 200);
    if (Array.isArray(b.cause)) {
      safe.cause = b.cause.slice(0, 3).map((c: Record<string, unknown>) => ({
        code: typeof c.code === "string" ? c.code : "unknown",
        description:
          typeof c.description === "string"
            ? c.description.slice(0, 100)
            : undefined,
      }));
    }
  }

  return safe;
}
