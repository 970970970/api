import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { articles } from "../db/schema";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
};

export const artcile = new Hono<{ Bindings: Env }>()

artcile.get("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const article = await db.query.articles.findFirst({ where: (item, { eq }) => eq(item.id, id) });
  if (!article) {
    return c.notFound()
  }
  return c.json({ status: 0, msg: "ok", data: article });
})

artcile.get("", async (c) => {
  const db = initDbConnect(c.env.DB);
  const allarticles = await db.select().from(articles).all();
  return c.json(
    { status: 0, message: 'ok', data: allarticles }
  );
})