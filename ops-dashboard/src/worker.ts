// Worker entry: the page code plus the bundled DM Sans font (SIL Open Font License, fonts/OFL.txt).
// Kept apart from src/index.ts so the tests can load the page code without the font file.

import font from '../fonts/dm-sans.woff2'
import { handle, type Env } from './index'

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env, new Date(), fetch, { font })
  },
} satisfies ExportedHandler<Env>
