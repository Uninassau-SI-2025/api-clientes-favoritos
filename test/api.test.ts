import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createTestDatabase, type TestDatabase } from "./sqlite-d1";

const products = [
  {
    id: 1,
    title: "Camiseta",
    price: 22.3,
    description: "Algodão",
    category: "roupas",
    image: "https://exemplo.test/1.png",
  },
  {
    id: 2,
    title: "Anel",
    price: 100,
    description: "Prata",
    category: "joias",
    image: "https://exemplo.test/2.png",
  },
];

function fakeFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/products/categories")) {
      return Response.json(["roupas", "joias"]);
    }
    const match = url.match(/\/products\/(\d+)$/);
    if (match) {
      const product = products.find((item) => item.id === Number(match[1]));
      if (!product) return Response.json(null, { status: 404 });
      return Response.json(product);
    }
    if (url.endsWith("/products")) return Response.json(products);
    return new Response("indisponivel", { status: 500 });
  }) as typeof fetch;
}

function failingFetch(): typeof fetch {
  return (async () => {
    throw new Error("rede fora");
  }) as typeof fetch;
}

async function bodyOf(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("API de clientes e favoritos", () => {
  let db: TestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDatabase();
    app = createApp(db, fakeFetch());
  });

  async function postClient(overrides: Record<string, unknown> = {}) {
    return app.request("/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ronicarlos Vieira",
        email: "roni@exemplo.com",
        password: "senha123",
        ...overrides,
      }),
    });
  }

  it("cadastra um cliente sem devolver a senha e guarda o hash", async () => {
    const response = await postClient();
    const body = await bodyOf(response);

    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`/clients/${body.id}`);
    expect(body).toMatchObject({
      id: 1,
      name: "Ronicarlos Vieira",
      email: "roni@exemplo.com",
    });
    expect(body.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.password).toBeUndefined();
    expect(body.password_hash).toBeUndefined();

    const stored = await db.prepare("SELECT password_hash FROM clients WHERE id = ?").bind(body.id).first<{ password_hash: string }>();
    expect(stored?.password_hash.startsWith("pbkdf2-sha256$5000$")).toBe(true);
    expect(stored?.password_hash).not.toContain("senha123");
  });

  it("gera hashes diferentes para a mesma senha", async () => {
    const first = await bodyOf(await postClient());
    const second = await bodyOf(await postClient({ email: "amanda@exemplo.com", name: "Amanda Moreira" }));
    const rows = await db.prepare("SELECT password_hash FROM clients ORDER BY id").all<{ password_hash: string }>();
    const hashes = rows.results?.map((row) => row.password_hash) ?? [];
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
    expect(first.id).not.toBe(second.id);
  });

  it("recusa cadastro inválido", async () => {
    const missingName = await bodyOf(await postClient({ name: " " }));
    expect((await postClient({ name: " " })).status).toBe(400);
    expect(missingName.error).toBe("Nome deve ter pelo menos 2 caracteres");

    const badEmail = await postClient({ email: "sem-arroba" });
    expect(badEmail.status).toBe(400);
    expect((await bodyOf(badEmail)).error).toBe("E-mail inválido");

    const shortPassword = await postClient({ password: "123" });
    expect(shortPassword.status).toBe(400);
    expect((await bodyOf(shortPassword)).error).toBe("Senha deve ter pelo menos 6 caracteres");

    const broken = await app.request("/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(broken.status).toBe(400);
    expect((await bodyOf(broken)).error).toBe("JSON inválido");
  });

  it("recusa e-mail duplicado", async () => {
    await postClient();
    const response = await postClient({ email: "Roni@Exemplo.com" });
    expect(response.status).toBe(409);
    expect((await bodyOf(response)).error).toBe("E-mail já cadastrado");
  });

  it("lista e consulta clientes", async () => {
    await postClient();
    await postClient({ name: "Amanda Moreira de Sá", email: "amanda@exemplo.com" });

    const list = await app.request("/clients");
    const clients = await bodyOf(list);
    expect(list.status).toBe(200);
    expect(clients.map((client: { email: string }) => client.email)).toEqual([
      "roni@exemplo.com",
      "amanda@exemplo.com",
    ]);

    const one = await app.request("/clients/2");
    expect(one.status).toBe(200);
    expect(await bodyOf(one)).toMatchObject({ id: 2, name: "Amanda Moreira de Sá" });

    const missing = await app.request("/clients/99");
    expect(missing.status).toBe(404);
    expect((await bodyOf(missing)).error).toBe("Cliente não encontrado");

    const invalid = await app.request("/clients/abc");
    expect(invalid.status).toBe(400);
    expect((await bodyOf(invalid)).error).toBe("ID inválido");
  });

  it("atualiza e exclui um cliente, e apaga os favoritos junto", async () => {
    const created = await bodyOf(await postClient());
    await app.request(`/clients/${created.id}/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product_id: 1 }),
    });

    const updated = await app.request(`/clients/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ronicarlos Ferreira", password: "outrasenha" }),
    });
    expect(updated.status).toBe(200);
    expect(await bodyOf(updated)).toMatchObject({
      id: created.id,
      name: "Ronicarlos Ferreira",
      email: "roni@exemplo.com",
    });

    const stored = await db.prepare("SELECT password_hash FROM clients WHERE id = ?").bind(created.id).first<{ password_hash: string }>();
    expect(stored?.password_hash.startsWith("pbkdf2-sha256$5000$")).toBe(true);
    expect(stored?.password_hash).not.toContain("outrasenha");

    const emptyUpdate = await app.request(`/clients/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(emptyUpdate.status).toBe(400);
    expect((await bodyOf(emptyUpdate)).error).toBe("Informe ao menos um campo para atualizar");

    const removed = await app.request(`/clients/${created.id}`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe("");
    expect((await app.request(`/clients/${created.id}`)).status).toBe(404);

    const favorites = await db.prepare("SELECT id FROM favorites WHERE client_id = ?").bind(created.id).all();
    expect(favorites.results).toEqual([]);
  });

  it("consulta produtos e categorias da Fake Store", async () => {
    const list = await app.request("/products");
    expect(list.status).toBe(200);
    expect(await bodyOf(list)).toEqual(products);

    const one = await app.request("/products/2");
    expect(one.status).toBe(200);
    expect(await bodyOf(one)).toMatchObject({ id: 2, title: "Anel" });

    const missing = await app.request("/products/99");
    expect(missing.status).toBe(404);
    expect((await bodyOf(missing)).error).toBe("Produto não encontrado");

    const categories = await app.request("/categories");
    expect(categories.status).toBe(200);
    expect(await bodyOf(categories)).toEqual(["roupas", "joias"]);
  });

  it("responde 502 quando a Fake Store falha", async () => {
    const broken = createApp(db, failingFetch());
    const response = await broken.request("/products");
    expect(response.status).toBe(502);
    expect((await bodyOf(response)).error).toBe("Falha ao consultar a Fake Store API");
  });

  it("adiciona, lista e remove favoritos do cliente", async () => {
    const client = await bodyOf(await postClient());
    const created = await app.request(`/clients/${client.id}/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product_id: 1 }),
    });
    const favorite = await bodyOf(created);
    expect(created.status).toBe(201);
    expect(favorite).toMatchObject({
      client_id: client.id,
      product_id: 1,
      product: products[0],
    });
    expect(favorite.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const list = await app.request(`/clients/${client.id}/favorites`);
    expect(list.status).toBe(200);
    expect(await bodyOf(list)).toEqual([favorite]);

    const removed = await app.request(`/clients/${client.id}/favorites/1`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect(await bodyOf(await app.request(`/clients/${client.id}/favorites`))).toEqual([]);
  });

  it("não deixa favoritar o mesmo produto duas vezes", async () => {
    const client = await bodyOf(await postClient());
    await app.request(`/clients/${client.id}/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product_id: 1 }),
    });
    const again = await app.request(`/clients/${client.id}/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product_id: 1 }),
    });
    expect(again.status).toBe(409);
    expect((await bodyOf(again)).error).toBe("Produto já está nos favoritos");
  });

  it("recusa favorito sem cliente ou sem produto", async () => {
    const missingClient = await app.request("/clients/40/favorites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product_id: 1 }),
    });
    expect(missingClient.status).toBe(404);
    expect((await bodyOf(missingClient)).error).toBe("Cliente não encontrado");

    const client = await bodyOf(await postClient());
    const missingProduct = await app.request(`/clients/${client.id}/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ product_id: 99 }),
    });
    expect(missingProduct.status).toBe(404);
    expect((await bodyOf(missingProduct)).error).toBe("Produto não encontrado");

    const missingFavorite = await app.request(`/clients/${client.id}/favorites/1`, { method: "DELETE" });
    expect(missingFavorite.status).toBe(404);
    expect((await bodyOf(missingFavorite)).error).toBe("Favorito não encontrado");
  });

  it("mantém o cliente depois de uma nova consulta", async () => {
    const created = await bodyOf(await postClient());
    const again = createApp(db, fakeFetch());
    const loaded = await again.request(`/clients/${created.id}`);
    expect(loaded.status).toBe(200);
    expect((await bodyOf(loaded)).email).toBe("roni@exemplo.com");
  });

  it("publica a documentação Swagger", async () => {
    const spec = await app.request("/openapi.json");
    expect(spec.status).toBe(200);
    const document = await bodyOf(spec);
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe("API de Clientes e Favoritos");
    expect(document.paths["/clients"].post).toBeTruthy();
    expect(document.paths["/clients"].get).toBeTruthy();
    expect(document.paths["/clients/{id}"].get).toBeTruthy();
    expect(document.paths["/clients/{id}"].put).toBeTruthy();
    expect(document.paths["/clients/{id}"].delete).toBeTruthy();
    expect(document.paths["/products"].get).toBeTruthy();
    expect(document.paths["/products/{id}"].get).toBeTruthy();
    expect(document.paths["/categories"].get).toBeTruthy();
    expect(document.paths["/clients/{id}/favorites"].post).toBeTruthy();
    expect(document.paths["/clients/{id}/favorites"].get).toBeTruthy();
    expect(document.paths["/clients/{id}/favorites/{productId}"].delete).toBeTruthy();

    const docs = await app.request("/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    const html = await docs.text();
    expect(html.toLowerCase()).toContain("swagger");
    expect(html).toContain("/openapi.json");
  });

  it("responde a raiz e libera CORS", async () => {
    const root = await app.request("/");
    expect(root.status).toBe(200);
    expect(await bodyOf(root)).toMatchObject({ name: "API de Clientes e Favoritos" });

    const preflight = await app.request("/clients", {
      method: "OPTIONS",
      headers: { origin: "https://exemplo.pages.dev", "access-control-request-method": "POST" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  });
});
