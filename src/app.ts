import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Database } from "./db";
import {
  HttpError,
  asObject,
  parseEmail,
  parseName,
  parsePassword,
  parseProductId,
  parseRouteId,
  readJson,
} from "./http";
import { hashPassword } from "./password";

const FAKE_STORE = "https://fakestoreapi.com";

type ClientRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
};

type FavoriteRow = {
  id: number;
  client_id: number;
  product_id: number;
  created_at: string;
};

type Product = {
  id: number;
  title?: string;
  price?: number;
  description?: string;
  category?: string;
  image?: string;
};

function publicClient(row: ClientRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    created_at: row.created_at,
  };
}

async function findClient(db: Database, id: number): Promise<ClientRow | null> {
  return db.prepare("SELECT id, name, email, password_hash, created_at FROM clients WHERE id = ?").bind(id).first<ClientRow>();
}

async function requireClient(db: Database, id: number): Promise<ClientRow> {
  const client = await findClient(db, id);
  if (!client) throw new HttpError(404, "Cliente não encontrado");
  return client;
}

async function storeResponse(fetchImpl: typeof fetch, path: string): Promise<Response> {
  try {
    return await fetchImpl(`${FAKE_STORE}${path}`);
  } catch {
    throw new HttpError(502, "Falha ao consultar a Fake Store API");
  }
}

async function storeJson<T>(fetchImpl: typeof fetch, path: string): Promise<T> {
  const response = await storeResponse(fetchImpl, path);
  if (!response.ok) throw new HttpError(502, "Falha ao consultar a Fake Store API");
  try {
    return (await response.json()) as T;
  } catch {
    throw new HttpError(502, "Falha ao consultar a Fake Store API");
  }
}

async function findProduct(fetchImpl: typeof fetch, productId: number): Promise<Product | null> {
  const response = await storeResponse(fetchImpl, `/products/${productId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(502, "Falha ao consultar a Fake Store API");
  const product = (await response.json()) as Product | null;
  if (!product || typeof product !== "object") return null;
  return product;
}

export function createApp(db: Database, fetchImpl: typeof fetch = fetch) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: "Erro interno" }, 500);
  });

  app.get("/", (c) =>
    c.json({
      name: "API de Clientes e Favoritos",
      equipe: [
        "Ronicarlos Vieira Cruz Ferreira — 37012676",
        "Amanda Moreira de Sá — 37024276",
      ],
      endpoints: [
        "POST /clients",
        "GET /clients",
        "GET /clients/:id",
        "PUT /clients/:id",
        "DELETE /clients/:id",
        "GET /products",
        "GET /products/:id",
        "GET /categories",
        "POST /clients/:id/favorites",
        "GET /clients/:id/favorites",
        "DELETE /clients/:id/favorites/:productId",
      ],
    }),
  );

  app.post("/clients", async (c) => {
    const body = asObject(await readJson(c.req.raw));
    const name = parseName(body.name);
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);
    const existing = await db.prepare("SELECT id FROM clients WHERE email = ?").bind(email).first();
    if (existing) throw new HttpError(409, "E-mail já cadastrado");

    const createdAt = new Date().toISOString();
    const passwordHash = await hashPassword(password);
    const inserted = await db
      .prepare("INSERT INTO clients (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(name, email, passwordHash, createdAt)
      .run();
    const id = inserted.meta?.last_row_id;
    if (!id) throw new Error("Falha ao gravar cliente");
    const client = await requireClient(db, id);
    return c.json(publicClient(client), 201, { Location: `/clients/${id}` });
  });

  app.get("/clients", async (c) => {
    const rows = await db
      .prepare("SELECT id, name, email, password_hash, created_at FROM clients ORDER BY id")
      .all<ClientRow>();
    return c.json((rows.results ?? []).map(publicClient));
  });

  app.get("/clients/:id", async (c) => {
    const client = await requireClient(db, parseRouteId(c.req.param("id")));
    return c.json(publicClient(client));
  });

  app.put("/clients/:id", async (c) => {
    const id = parseRouteId(c.req.param("id"));
    const current = await requireClient(db, id);
    const body = asObject(await readJson(c.req.raw));
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
    const hasPassword = Object.prototype.hasOwnProperty.call(body, "password");
    if (!hasName && !hasEmail && !hasPassword) {
      throw new HttpError(400, "Informe ao menos um campo para atualizar");
    }

    const name = hasName ? parseName(body.name) : current.name;
    const email = hasEmail ? parseEmail(body.email) : current.email;
    if (hasEmail) {
      const taken = await db
        .prepare("SELECT id FROM clients WHERE email = ? AND id <> ?")
        .bind(email, id)
        .first();
      if (taken) throw new HttpError(409, "E-mail já cadastrado");
    }
    const passwordHash = hasPassword ? await hashPassword(parsePassword(body.password)) : current.password_hash;

    await db
      .prepare("UPDATE clients SET name = ?, email = ?, password_hash = ? WHERE id = ?")
      .bind(name, email, passwordHash, id)
      .run();
    const updated = await requireClient(db, id);
    return c.json(publicClient(updated));
  });

  app.delete("/clients/:id", async (c) => {
    const id = parseRouteId(c.req.param("id"));
    await requireClient(db, id);
    await db.prepare("DELETE FROM favorites WHERE client_id = ?").bind(id).run();
    await db.prepare("DELETE FROM clients WHERE id = ?").bind(id).run();
    return c.body(null, 204);
  });

  app.get("/products", async (c) => {
    const products = await storeJson<unknown>(fetchImpl, "/products");
    if (!Array.isArray(products)) throw new HttpError(502, "Falha ao consultar a Fake Store API");
    return c.json(products);
  });

  app.get("/products/:id", async (c) => {
    const product = await findProduct(fetchImpl, parseRouteId(c.req.param("id")));
    if (!product) throw new HttpError(404, "Produto não encontrado");
    return c.json(product);
  });

  app.get("/categories", async (c) => {
    const categories = await storeJson<unknown>(fetchImpl, "/products/categories");
    if (!Array.isArray(categories)) throw new HttpError(502, "Falha ao consultar a Fake Store API");
    return c.json(categories);
  });

  app.post("/clients/:id/favorites", async (c) => {
    const clientId = parseRouteId(c.req.param("id"));
    await requireClient(db, clientId);
    const body = asObject(await readJson(c.req.raw));
    const productId = parseProductId(body.product_id);
    const duplicate = await db
      .prepare("SELECT id FROM favorites WHERE client_id = ? AND product_id = ?")
      .bind(clientId, productId)
      .first();
    if (duplicate) throw new HttpError(409, "Produto já está nos favoritos");

    const product = await findProduct(fetchImpl, productId);
    if (!product) throw new HttpError(404, "Produto não encontrado");

    const createdAt = new Date().toISOString();
    const inserted = await db
      .prepare("INSERT INTO favorites (client_id, product_id, created_at) VALUES (?, ?, ?)")
      .bind(clientId, productId, createdAt)
      .run();
    const favoriteId = inserted.meta?.last_row_id;
    if (!favoriteId) throw new Error("Falha ao gravar favorito");
    const favorite = await db
      .prepare("SELECT id, client_id, product_id, created_at FROM favorites WHERE id = ?")
      .bind(favoriteId)
      .first<FavoriteRow>();
    if (!favorite) throw new Error("Falha ao gravar favorito");
    return c.json({ ...favorite, product }, 201);
  });

  app.get("/clients/:id/favorites", async (c) => {
    const clientId = parseRouteId(c.req.param("id"));
    await requireClient(db, clientId);
    const rows = await db
      .prepare("SELECT id, client_id, product_id, created_at FROM favorites WHERE client_id = ? ORDER BY id")
      .bind(clientId)
      .all<FavoriteRow>();
    const favorites = rows.results ?? [];
    const catalog = await storeJson<Product[]>(fetchImpl, "/products");
    if (!Array.isArray(catalog)) throw new HttpError(502, "Falha ao consultar a Fake Store API");
    return c.json(
      favorites.map((favorite) => ({
        ...favorite,
        product: catalog.find((product) => product.id === favorite.product_id) ?? null,
      })),
    );
  });

  app.delete("/clients/:id/favorites/:productId", async (c) => {
    const clientId = parseRouteId(c.req.param("id"));
    const productId = parseRouteId(c.req.param("productId"));
    await requireClient(db, clientId);
    const removed = await db
      .prepare("DELETE FROM favorites WHERE client_id = ? AND product_id = ?")
      .bind(clientId, productId)
      .run();
    if (!removed.meta?.changes) throw new HttpError(404, "Favorito não encontrado");
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: "Rota não encontrada" }, 404));

  return app;
}
