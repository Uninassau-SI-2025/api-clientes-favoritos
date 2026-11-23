# API de Clientes e Favoritos

API REST da atividade prática de back-end: cadastro de clientes, consulta de produtos da [Fake Store API](https://fakestoreapi.com/) e lista de favoritos por cliente.

A API roda em Cloudflare Workers, grava os dados no Cloudflare D1 e está publicada em:

https://api-clientes-favoritos.roni0028.workers.dev

Documentação interativa (Swagger): https://api-clientes-favoritos.roni0028.workers.dev/docs

## Equipe

- Ronicarlos Vieira Cruz Ferreira — matrícula 37012676
- Amanda Moreira de Sá — matrícula 37024276

Os nomes e as matrículas estão nos outros trabalhos da organização [Uninassau-SI-2025](https://github.com/Uninassau-SI-2025): a Central de Chamados (`central-de-chamados-FRONT-END-FRAMEWORKS`) e o AssisTec (`assistec-amanda-moreira`).

## O que a API faz

1. Cadastra o cliente e guarda a senha só como hash.
2. Lista, consulta, atualiza e exclui clientes.
3. Consulta produtos e categorias na Fake Store, sem copiar o catálogo para o banco.
4. Cada cliente tem a própria lista de favoritos. O mesmo produto não entra duas vezes.
5. Excluir o cliente também exclui os favoritos dele.

## Tecnologias

- TypeScript e [Hono](https://hono.dev/) no Cloudflare Workers
- Cloudflare D1 (SQLite)
- Wrangler
- Fake Store API, via `fetch`
- Vitest
- Swagger UI em `/docs`, com a especificação OpenAPI em `/openapi.json`

A senha usa PBKDF2-SHA-256 com sal aleatório de 16 bytes e 5000 iterações (`pbkdf2-sha256$5000$...`). O plano gratuito dos Workers limita a CPU a 10 ms por requisição, então a contagem de iterações fica abaixo da recomendação geral do PBKDF2 e ainda impede senha em texto puro.

## Banco de dados

Duas tabelas, em `migrations/0001_init.sql`:

`clients`: `id`, `name`, `email` (único), `password_hash`, `created_at`

`favorites`: `id`, `client_id`, `product_id`, `created_at`

Um cliente tem vários favoritos. O par `client_id` + `product_id` é único. `product_id` é o id do produto na Fake Store.

## Endpoints

A raiz `GET /` devolve o nome da API e esta lista. O Swagger fica em `GET /docs` e o arquivo OpenAPI em `GET /openapi.json`. Erros vêm como `{ "error": "mensagem" }`.

### Clientes

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/clients` | Cadastra um cliente |
| GET | `/clients` | Lista os clientes |
| GET | `/clients/:id` | Consulta um cliente |
| PUT | `/clients/:id` | Atualiza nome, e-mail e/ou senha |
| DELETE | `/clients/:id` | Exclui o cliente e os favoritos dele |

Cadastro:

```http
POST /clients
Content-Type: application/json

{
  "name": "Ronicarlos Vieira",
  "email": "roni@exemplo.com",
  "password": "senha123"
}
```

Resposta `201`, com cabeçalho `Location`:

```json
{
  "id": 1,
  "name": "Ronicarlos Vieira",
  "email": "roni@exemplo.com",
  "created_at": "2026-11-23T12:00:00.000Z"
}
```

A resposta não inclui `password` nem `password_hash`. O e-mail é gravado em minúsculas.

Atualização (`PUT`) envia só o que muda. Corpo vazio responde `400`.

| Situação | Status |
| --- | --- |
| Cadastro válido | 201 |
| Nome com menos de 2 caracteres, e-mail inválido, senha com menos de 6 caracteres ou JSON inválido | 400 |
| E-mail já cadastrado | 409 |
| Cliente inexistente | 404 |
| ID da URL inválido | 400 |
| Exclusão concluída | 204 |

### Produtos

Os dados vêm de `https://fakestoreapi.com`. Nada disso é cadastrado no D1.

| Método | Rota | Origem |
| --- | --- | --- |
| GET | `/products` | `/products` |
| GET | `/products/:id` | `/products/:id` |
| GET | `/categories` | `/products/categories` |

Produto inexistente: `404` `{ "error": "Produto não encontrado" }`.

Se a Fake Store não responder: `502` `{ "error": "Falha ao consultar a Fake Store API" }`.

### Favoritos

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/clients/:id/favorites` | Adiciona um produto |
| GET | `/clients/:id/favorites` | Lista os favoritos, com os dados do produto |
| DELETE | `/clients/:id/favorites/:productId` | Remove o produto da lista |

```http
POST /clients/1/favorites
Content-Type: application/json

{ "product_id": 1 }
```

Resposta `201`:

```json
{
  "id": 1,
  "client_id": 1,
  "product_id": 1,
  "created_at": "2026-11-23T12:00:00.000Z",
  "product": { "id": 1, "title": "...", "price": 0, "description": "...", "category": "...", "image": "..." }
}
```

| Situação | Status |
| --- | --- |
| Produto favoritado | 201 |
| O mesmo produto de novo para o mesmo cliente | 409 |
| Cliente ou produto inexistente | 404 |
| Favorito que não está na lista | 404 |
| Remoção concluída | 204 |

## Como executar

É preciso ter Node.js 22 ou mais recente.

```bash
npm install
npm test
npx wrangler d1 migrations apply api-clientes-favoritos --local
npx wrangler dev
```

A API local abre em `http://127.0.0.1:8787`.

Exemplo:

```bash
curl -i http://127.0.0.1:8787/clients -H "Content-Type: application/json" -d "{\"name\":\"Amanda Moreira\",\"email\":\"amanda@exemplo.com\",\"password\":\"senha123\"}"
curl http://127.0.0.1:8787/products
curl http://127.0.0.1:8787/categories
```

O CORS está liberado (`Access-Control-Allow-Origin: *`) para um front-end futuro.

## Publicar na Cloudflare

O banco D1 `api-clientes-favoritos` já está criado na conta `roni0028@hotmail.com`. O `database_id` está no `wrangler.toml`.

```bash
npx wrangler login
npm run db:migrate:remote
npm run deploy
```

A URL fica no formato `https://api-clientes-favoritos.<sua-subdomain>.workers.dev`.

Para recriar o banco em outra conta:

```bash
npx wrangler d1 create api-clientes-favoritos
```

Copie o novo `database_id` para o `wrangler.toml` e rode a migração de novo.

## Testes

`npm test` cobre o roteiro da atividade: cadastro, consulta, atualização, exclusão, produtos, categorias, favoritos, favorito repetido e persistência no banco. O banco dos testes é SQLite em memória com a mesma migração do D1. A Fake Store é substituída por respostas fixas, para o teste não depender da rede.
