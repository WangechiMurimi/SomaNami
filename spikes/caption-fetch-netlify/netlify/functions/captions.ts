import { handleRequest } from '../../src/handle-request.ts'

/** Netlify Function for the caption spike; all logic lives in `src/` so tests skip the runtime. */
export default (request: Request): Promise<Response> => handleRequest(request)

export const config = { path: ['/run', '/captions/:id'] }
