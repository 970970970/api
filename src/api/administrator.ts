import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { admin_users } from "../db/schema";
import { count, eq } from "drizzle-orm";
import { hashSync } from "bcrypt-edge"
import { jwt } from 'hono/jwt'

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
  saltRounds: number;
};

export const administrator = new Hono<{ Bindings: Env }>()
const secure = new Hono<{ Bindings: Env }>()

secure.use('*', (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
  })
  return jwtMiddleware(c, next)
});

secure.get("", async (c) => {
  const db = initDbConnect(c.env.DB);
  const offset = Number(c.req.query('offset')) || 0;
  const limit = Number(c.req.query('limit')) || 10;
  const admins = await db.select().from(admin_users).offset(offset).limit(limit);
  const total = await db.select({ value: count() }).from(admin_users);
  return c.json({
    status: 0, msg: 'ok', data: {
      items: admins,
      total: total[0].value,
    }
  });
})

secure.post("/create", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();
  const hash = hashSync(body.password, c.env.saltRounds);
  const admin = await db
    .insert(admin_users)
    .values({ email: body.email, password: hash, status: body.status })
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: admin
  })
})

secure.delete("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const action = await db
    .delete(admin_users)
    .where(eq(admin_users.id, id))
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: null
  })
})

secure.put("/password/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const hash = hashSync(body.password, c.env.saltRounds);
  const action = await db
    .update(admin_users)
    .set({ password: hash })
    .where(eq(admin_users.id, id))
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: null
  })
})

secure.put("/status/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const action = await db
    .update(admin_users)
    .set({ status: body.status })
    .where(eq(admin_users.id, id))
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: null
  })
})

administrator.route("/secure", secure)