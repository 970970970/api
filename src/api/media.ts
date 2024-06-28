import { Hono } from 'hono';
import { nanoid } from "nanoid";
import { initDbConnect } from "../db/index";
import { media_files } from "../db/schema";
import { count, eq } from "drizzle-orm";
import { jwt } from 'hono/jwt'

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
};

export const media = new Hono<{ Bindings: Env }>()
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
  const files = await db.select().from(media_files).offset(offset).limit(limit);
  const total = await db.select({ value: count() }).from(media_files);
  return c.json({
    status: 0, msg: 'ok', data: {
      items: files,
      total: total[0].value,
    }
  });
})

secure.post("/tmp_upload", async (c) => {
  //上传单个文件，放在临时目录，等待表单提交后上传到r2
  const body = await c.req.parseBody();
  const key = nanoid(10)
  const file = body.file
  if (file instanceof File) {
    const fileBuffer = await file.arrayBuffer()
    const path = `media/tmp/${nanoid()}.${file.name.split('.').pop()}`
    const upload = await c.env.BUCKET.put(path, fileBuffer)
    if (upload) {
      return c.json({
        status: 0, msg: 'ok', data: {
          value: path
        }
      })
    } else {
      return c.json({
        status: 400, msg: 'upload failed', data: null
      })
    }
  } else {
    return c.json({
      status: 400, msg: 'invalid file', data: null
    })
  }
})

secure.post("/upload", async (c) => {
  //上传文件处理流程
  const body = await c.req.json();
  const src_path = body.file
  const ext = src_path.split('.').pop()
  if (!src_path.startsWith('media/tmp')) {
    return c.json({
      status: 400, msg: 'invalid path', data: null
    })
  }
  const key = nanoid(10)
  const src_file = await c.env.BUCKET.get(src_path)
  if (src_file === null) {
    return c.json({ status: 400, msg: 'file not found', data: null })
  }
  const move = await c.env.BUCKET.put(`media/system/${key}.${ext}`, src_file.body)
  if (move === null) {
    return c.json({ status: 400, msg: 'move failed', data: null })
  }

  const db = initDbConnect(c.env.DB);
  const action = await db
    .insert(media_files)
    .values({
      name: body.name,
      description: body.description,
      type_id: body.type_id,
      path: `media/system/${key}.${ext}`,
      content_type: src_file.httpMetadata?.contentType || 'application/octet-stream',
      size: src_file.size,
      upload_time: Date.now()
    })
    .execute();
  if (!action.success) {
    return c.json({ status: 400, msg: 'insert failed', data: null })
  }
  // 删除原有文件
  await c.env.BUCKET.delete(src_path)
  return c.json({
    status: 0, msg: 'ok', data: action.meta
  })
})

secure.put("/:id", async (c) => {
  //修改文件信息
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const db = initDbConnect(c.env.DB);
  const media = await db.query.media_files.findFirst({ where: (item, { eq }) => eq(item.id, id) });
  if (!media) {
    return c.notFound()
  }
  if (body.file && body.file.startsWith('media/tmp')) {
    //文件发生变化,处理更新文件逻辑
    //从数据库中获取原有文件的路径，调用d1删除接口删除原有文件，再调用d1上传接口上传新文件
    const old_path = media.path

    const key = nanoid(10)
    const ext = body.file.split('.').pop()
    const src_file = await c.env.BUCKET.get(body.file)
    if (src_file === null) {
      return c.json({ status: 400, msg: 'file not found', data: null })
    }
    const move = await c.env.BUCKET.put(`media/system/${key}.${ext}`, src_file.body)
    if (move === null) {
      return c.json({ status: 400, msg: 'move failed', data: null })
    }
    const path = `media/system/${key}.${ext}`
    //删除原有文件
    await c.env.BUCKET.delete(media.path)
    await c.env.BUCKET.delete(old_path)
    media.path = path
  }
  media.name = body.name
  media.description = body.description
  media.type_id = body.type_id
  const action = await db
    .update(media_files)
    .set(media)
    .where(eq(media_files.id, id))
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: action.meta
  })
})

secure.delete("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const media = await db.query.media_files.findFirst({ where: (item, { eq }) => eq(item.id, id) });
  if (!media) {
    return c.notFound()
  }
  const path = media.path
  //删除文件
  await c.env.BUCKET.delete(path)

  const action = await db
    .delete(media_files)
    .where(eq(media_files.id, id))
    .execute();
  return c.json({
    status: 0, msg: 'ok', data: null
  })
})

//查看文件
secure.get("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const file = await db.query.media_files.findFirst({ where: (item, { eq }) => eq(item.id, id) });
  if (!file) {
    return c.notFound()
  }
  return c.json({
    status: 0, msg: 'ok', data: file
  })
})

media.route("/secure", secure)