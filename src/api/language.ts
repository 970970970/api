import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { languages } from "../db/schema";
import { count, eq } from "drizzle-orm";
import { jwt } from 'hono/jwt'

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
};

export const language = new Hono<{ Bindings: Env }>()
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

language.get("", async (c) => {
  const db = initDbConnect(c.env.DB);
  const offset = Number(c.req.query('offset')) || 0;
  const limit = Number(c.req.query('limit')) || 10;
  const languageslist = await db.select().from(languages).offset(offset).limit(limit);
  const total = await db.select({ value: count() }).from(languages);
  return c.json({
    status: 0, msg: 'ok', data: {
      items: languageslist,
      total: total[0].value,
    }
  });
})

language.get("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const language = await db.query.languages.findFirst({ where: (item, { eq }) => eq(item.id, id) });
  if (!language) {
    return c.notFound()
  }
  return c.json({ status: 0, msg: "ok", data: language });
})

secure.put("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const language = await db
    .update(languages)
    .set(body)
    .where(eq(languages.id, id))
    .returning()
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: language
  })
})

secure.delete("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  await db.delete(languages).where(eq(languages.id, id)).execute();
  return c.json({ status: 0, msg: 'ok' });
})

secure.post("/create", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();
  /*
  const code = body.code;
  const name = body.name;
  const flag = body.flag;
  const status = Boolean(body.status);
  */
  const language = await db.insert(languages).values(body).returning().execute();
  return c.json({ status: 0, msg: 'ok', data: language });
})

secure.put("/:id/status", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const language = await db
    .update(languages)
    .set({ status: body.status })
    .where(eq(languages.id, id))
    .returning()
    .execute();
  return c.json({
    status: 0, 
    msg: 'ok', 
    data: language
  });
});

language.route("/secure", secure)
