import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { articles } from "../db/schema";
import { jwt } from 'hono/jwt'

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
};

export const artcile = new Hono<{ Bindings: Env }>()
const secure = new Hono<{ Bindings: Env }>()

secure.use('*', async (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
  })
  try {
    await jwtMiddleware(c, next)
  } catch (e) {
    return c.json({
      status: 401, msg: 'unauthorized',
    })
  }
});

artcile.get("", async (c) => {
  return c.json({ status: 0, msg: 'ok' })
})

secure.get("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const article = await db.query.articles.findFirst({ where: (item, { eq }) => eq(item.id, id) });
  if (!article) {
    return c.notFound()
  }
  return c.json({ status: 0, msg: "ok", data: article });
})

secure.post("", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();
  console.log(body)
  const article = await db
    .insert(articles)
    .values({
      title: body.title,
      content: body.md,
      image: body.image || null,
      language: body.language || 'Chinese',
      category: body.category,
      summary: body.summary || '',
      rank: body.rank || 0,
    })
    .returning()
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: article
  })
})

secure.get("", async (c) => {
  const db = initDbConnect(c.env.DB);
  const allarticles = await db.select().from(articles).all();
  return c.json(
    { status: 0, message: 'ok', data: allarticles }
  );
})

artcile.route("/secure", secure)