import { createApp } from "./app";
import type { Database } from "./db";

export interface Env {
  DB: Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return createApp(env.DB).fetch(request);
  },
};
