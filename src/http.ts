const MAX_JSON_BYTES = 8 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 413 | 415 | 502,
    message: string,
  ) {
    super(message);
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Envie o corpo como application/json");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new HttpError(413, "Corpo da requisição excede o limite");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw new HttpError(413, "Corpo da requisição excede o limite");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "JSON inválido");
  }
  return value as Record<string, unknown>;
}

export function parseName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 2) {
    throw new HttpError(400, "Nome deve ter pelo menos 2 caracteres");
  }
  if (value.trim().length > 120) {
    throw new HttpError(400, "Nome deve ter no máximo 120 caracteres");
  }
  return value.trim();
}

export function parseEmail(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "E-mail inválido");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new HttpError(400, "E-mail inválido");
  return email;
}

export function parsePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 6) {
    throw new HttpError(400, "Senha deve ter pelo menos 6 caracteres");
  }
  if (value.length > 72) throw new HttpError(400, "Senha deve ter no máximo 72 caracteres");
  return value;
}

export function parseRouteId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new HttpError(400, "ID inválido");
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new HttpError(400, "ID inválido");
  return id;
}

export function parseProductId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new HttpError(400, "product_id inválido");
  }
  return value;
}
