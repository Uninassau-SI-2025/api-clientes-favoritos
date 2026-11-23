const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
  required: ["error"],
} as const;

const clientSchema = {
  type: "object",
  properties: {
    id: { type: "integer", example: 1 },
    name: { type: "string", example: "Ronicarlos Vieira" },
    email: { type: "string", format: "email", example: "roni@exemplo.com" },
    created_at: { type: "string", format: "date-time" },
  },
  required: ["id", "name", "email", "created_at"],
} as const;

const productSchema = {
  type: "object",
  description: "Produto devolvido pela Fake Store API.",
  properties: {
    id: { type: "integer", example: 1 },
    title: { type: "string" },
    price: { type: "number" },
    description: { type: "string" },
    category: { type: "string" },
    image: { type: "string", format: "uri" },
  },
  required: ["id"],
  additionalProperties: true,
} as const;

const favoriteSchema = {
  type: "object",
  properties: {
    id: { type: "integer", example: 1 },
    client_id: { type: "integer", example: 1 },
    product_id: { type: "integer", example: 1 },
    created_at: { type: "string", format: "date-time" },
    product: { oneOf: [productSchema, { type: "null" }] },
  },
  required: ["id", "client_id", "product_id", "created_at", "product"],
} as const;

const idParameter = {
  name: "id",
  in: "path",
  required: true,
  description: "ID do cliente.",
  schema: { type: "integer", minimum: 1 },
} as const;

const productIdParameter = {
  name: "productId",
  in: "path",
  required: true,
  description: "ID do produto na Fake Store.",
  schema: { type: "integer", minimum: 1 },
} as const;

function jsonBody(schema: object, example?: unknown) {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
        ...(example === undefined ? {} : { example }),
      },
    },
  };
}

function jsonResponse(description: string, schema: object) {
  return {
    description,
    content: {
      "application/json": { schema },
    },
  };
}

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "API de Clientes e Favoritos",
    version: "1.0.0",
    description:
      "Cadastro de clientes, consulta de produtos da Fake Store API e favoritos por cliente. A senha é armazenada só como hash e nunca volta na resposta. Equipe: Ronicarlos Vieira Cruz Ferreira — 37012676; Amanda Moreira de Sá — 37024276.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Clientes", description: "Cadastro persistido no Cloudflare D1." },
    { name: "Produtos", description: "Consulta em tempo real à Fake Store API." },
    { name: "Favoritos", description: "Lista de produtos de cada cliente. O par cliente + produto é único." },
  ],
  paths: {
    "/clients": {
      post: {
        tags: ["Clientes"],
        summary: "Cadastrar um cliente",
        requestBody: jsonBody(
          {
            type: "object",
            properties: {
              name: { type: "string", minLength: 2, maxLength: 120, example: "Ronicarlos Vieira" },
              email: { type: "string", format: "email", example: "roni@exemplo.com" },
              password: { type: "string", minLength: 6, maxLength: 72, format: "password", example: "senha123" },
            },
            required: ["name", "email", "password"],
          },
          { name: "Ronicarlos Vieira", email: "roni@exemplo.com", password: "senha123" },
        ),
        responses: {
          "201": {
            description: "Cliente cadastrado. O cabeçalho Location aponta para o recurso.",
            headers: {
              Location: { schema: { type: "string", example: "/clients/1" } },
            },
            content: { "application/json": { schema: clientSchema } },
          },
          "400": jsonResponse("Nome, e-mail, senha ou JSON inválido.", errorSchema),
          "409": jsonResponse("E-mail já cadastrado.", errorSchema),
          "413": jsonResponse("Corpo maior que 8 KB.", errorSchema),
          "415": jsonResponse("O corpo precisa ser application/json.", errorSchema),
        },
      },
      get: {
        tags: ["Clientes"],
        summary: "Listar clientes",
        responses: {
          "200": jsonResponse("Lista de clientes, sem a senha.", { type: "array", items: clientSchema }),
        },
      },
    },
    "/clients/{id}": {
      get: {
        tags: ["Clientes"],
        summary: "Consultar cliente por ID",
        parameters: [idParameter],
        responses: {
          "200": jsonResponse("Cliente encontrado.", clientSchema),
          "400": jsonResponse("ID inválido.", errorSchema),
          "404": jsonResponse("Cliente não encontrado.", errorSchema),
        },
      },
      put: {
        tags: ["Clientes"],
        summary: "Atualizar cadastro",
        parameters: [idParameter],
        requestBody: jsonBody(
          {
            type: "object",
            description: "Envie ao menos um campo.",
            properties: {
              name: { type: "string", minLength: 2, maxLength: 120 },
              email: { type: "string", format: "email" },
              password: { type: "string", minLength: 6, maxLength: 72, format: "password" },
            },
          },
          { name: "Ronicarlos Ferreira" },
        ),
        responses: {
          "200": jsonResponse("Cliente atualizado.", clientSchema),
          "400": jsonResponse("Nenhum campo informado, ou algum campo inválido.", errorSchema),
          "404": jsonResponse("Cliente não encontrado.", errorSchema),
          "409": jsonResponse("E-mail já cadastrado.", errorSchema),
          "413": jsonResponse("Corpo maior que 8 KB.", errorSchema),
          "415": jsonResponse("O corpo precisa ser application/json.", errorSchema),
        },
      },
      delete: {
        tags: ["Clientes"],
        summary: "Excluir cliente",
        description: "Remove o cliente e os favoritos dele.",
        parameters: [idParameter],
        responses: {
          "204": { description: "Cliente excluído." },
          "400": jsonResponse("ID inválido.", errorSchema),
          "404": jsonResponse("Cliente não encontrado.", errorSchema),
        },
      },
    },
    "/products": {
      get: {
        tags: ["Produtos"],
        summary: "Listar produtos externos",
        responses: {
          "200": jsonResponse("Catálogo da Fake Store.", { type: "array", items: productSchema }),
          "502": jsonResponse("Falha ao consultar a Fake Store API.", errorSchema),
        },
      },
    },
    "/products/{id}": {
      get: {
        tags: ["Produtos"],
        summary: "Consultar produto específico",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "ID do produto na Fake Store.",
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          "200": jsonResponse("Produto encontrado.", productSchema),
          "400": jsonResponse("ID inválido.", errorSchema),
          "404": jsonResponse("Produto não encontrado.", errorSchema),
          "502": jsonResponse("Falha ao consultar a Fake Store API.", errorSchema),
        },
      },
    },
    "/categories": {
      get: {
        tags: ["Produtos"],
        summary: "Listar categorias",
        responses: {
          "200": jsonResponse("Categorias da Fake Store.", {
            type: "array",
            items: { type: "string" },
            example: ["electronics", "jewelery"],
          }),
          "502": jsonResponse("Falha ao consultar a Fake Store API.", errorSchema),
        },
      },
    },
    "/clients/{id}/favorites": {
      post: {
        tags: ["Favoritos"],
        summary: "Adicionar produto aos favoritos",
        parameters: [idParameter],
        requestBody: jsonBody(
          {
            type: "object",
            properties: {
              product_id: { type: "integer", minimum: 1, example: 1 },
            },
            required: ["product_id"],
          },
          { product_id: 1 },
        ),
        responses: {
          "201": jsonResponse("Produto adicionado. A resposta inclui os dados do produto.", favoriteSchema),
          "400": jsonResponse("ID ou product_id inválido.", errorSchema),
          "404": jsonResponse("Cliente ou produto não encontrado.", errorSchema),
          "409": jsonResponse("Produto já está nos favoritos desse cliente.", errorSchema),
          "413": jsonResponse("Corpo maior que 8 KB.", errorSchema),
          "415": jsonResponse("O corpo precisa ser application/json.", errorSchema),
          "502": jsonResponse("Falha ao consultar a Fake Store API.", errorSchema),
        },
      },
      get: {
        tags: ["Favoritos"],
        summary: "Listar favoritos do cliente",
        parameters: [idParameter],
        responses: {
          "200": jsonResponse("Favoritos do cliente, com o produto quando ele ainda existe na Fake Store.", {
            type: "array",
            items: favoriteSchema,
          }),
          "400": jsonResponse("ID inválido.", errorSchema),
          "404": jsonResponse("Cliente não encontrado.", errorSchema),
          "502": jsonResponse("Falha ao consultar a Fake Store API.", errorSchema),
        },
      },
    },
    "/clients/{id}/favorites/{productId}": {
      delete: {
        tags: ["Favoritos"],
        summary: "Remover produto dos favoritos",
        parameters: [idParameter, productIdParameter],
        responses: {
          "204": { description: "Favorito removido." },
          "400": jsonResponse("ID inválido.", errorSchema),
          "404": jsonResponse("Cliente ou favorito não encontrado.", errorSchema),
        },
      },
    },
  },
};
