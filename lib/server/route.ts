import { z } from 'zod'
import { HttpError, jsonError } from '@/lib/server/errors'

export async function readJson<T>(request: Request, schema: z.ZodType<T>) {
  try {
    return schema.parse(await request.json())
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpError(400, error.issues[0]?.message ?? 'Invalid request')
    }
    throw new HttpError(400, 'Invalid JSON body')
  }
}

export async function respond(action: () => Promise<unknown>) {
  try {
    return Response.json(await action())
  } catch (error) {
    return jsonError(error)
  }
}
