import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { admin_users } from "../db/schema";
import { hashSync, compareSync } from "bcrypt-edge"
import { sql } from "drizzle-orm";
import { sign } from 'hono/jwt'

const saltRounds = 10;

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
};

export const utils = new Hono<{ Bindings: Env }>()

utils.post("/create_admin", async (c) => {
  const db = initDbConnect(c.env.DB);
  const count = await db.select({ count: sql<number>`count(*)` }).from(admin_users);
  if (count[0].count > 0) {
    return c.json({ status: 400, msg: 'admin already exists', data: null });
  }
  const body = await c.req.json();
  const hash = hashSync(body.password, saltRounds);

  //插入管理员
  await db
    .insert(admin_users)
    .values({ email: body.email, password: hash })
    .execute();

  return c.json({ status: 0, message: 'ok', data: body.email });
})
utils.post("/admin_login", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();
  const user = await db.query.admin_users.findFirst({ where: (user, { eq }) => eq(user.email, body.email) });
  if (!user) {
    return c.json({ status: 400, msg: 'user not found', data: null });
  }
  if (!compareSync(body.password, user.password)) {
    return c.json({ status: 400, msg: 'password error', data: null });
  }
  if (user.status === 0) {
    return c.json({ status: 400, msg: 'user disabled', data: null });
  }
  if (user.two_factor_secret) {
    return c.json({ status: 400, msg: 'two factor auth enabled', data: null });
  }
  const payload = {
    email: user.email,
    id: user.id,
    exp: Math.floor(Date.now() / 1000) + 3600 * 72,
  }
  console.log(c.env.JWT_SECRET);
  const token = await sign(payload, c.env.JWT_SECRET);
  return c.json({
    status: 0, msg: 'ok', data: {
      token: token,
      email: user.email,
      id: user.id
    }
  });
})

utils.post("/check_admin_status", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();
  console.log(body.email);
  const user = await db.query.admin_users.findFirst({ where: (user, { eq }) => eq(user.email, body.email) });
  if (!user) {
    return c.json({ status: 400, msg: 'user not found', data: null });
  }
  if (user.status === 0) {
    return c.json({ status: 400, msg: 'user disabled', data: null });
  }
  return c.json({ status: 0, msg: 'ok', data: { disable_2fa: user.two_factor_secret === null } });
})