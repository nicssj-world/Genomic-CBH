export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function jsonError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : 'Unexpected error'
  return Response.json({ error: message }, { status: 500 })
}
