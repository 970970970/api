import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { media_files } from "../db/schema";
import { jwt } from 'hono/jwt'
import { eq, desc, or, like, and, sql } from 'drizzle-orm';

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
};

// 添加 FormDataFile 接口定义
interface FormDataFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

// MIME 类型映射
const MIME_TYPES = {
  // 图片
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  // 视频
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  // 音频
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  // 文档
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
} as const;

// 获取文件的 MIME 类型
function getMimeType(filename: string): string {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return ext && MIME_TYPES[ext as keyof typeof MIME_TYPES] || 'application/octet-stream';
}

const media = new Hono<{ Bindings: Env }>();
const secure = new Hono<{ Bindings: Env }>();

// JWT 中间件
secure.use('*', async (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
  })
  try {
    await jwtMiddleware(c, next)
  } catch (e) {
    return c.json({
      status: 401,
      msg: 'unauthorized',
    })
  }
});

// 获取媒体文件列表
secure.get("/list", async (c) => {
  const db = initDbConnect(c.env.DB);
  const limit = Number(c.req.query('limit') || '10');
  const offset = Number(c.req.query('offset') || '0');
  const keywords = c.req.query('keywords');

  try {
    const query = db.select().from(media_files);
    const whereConditions = [];
    if (keywords) {
      whereConditions.push(
        or(
          like(media_files.path, `%${keywords}%`),
          like(media_files.description, `%${keywords}%`)
        )
      );
    }

    const finalQuery = whereConditions.length > 0
      ? query.where(and(...whereConditions))
      : query;

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(media_files)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .get();

    const items = await finalQuery
      .limit(limit)
      .offset(offset)
      .orderBy(desc(media_files.upload_time))
      .execute();

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        items,
        total: totalResult?.count || 0
      }
    });
  } catch (error) {
    console.error("Error fetching media files:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 获取单个媒体文件详情
secure.get("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    const file = await db
      .select()
      .from(media_files)
      .where(eq(media_files.id, id))
      .get();

    if (!file) {
      return c.json({
        status: 404,
        msg: "File not found",
        data: null
      }, 404);
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: file
    });
  } catch (error) {
    console.error("Error fetching media file:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 更新媒体文件信息
secure.put("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  try {
    const result = await db
      .update(media_files)
      .set({
        description: body.description
      })
      .where(eq(media_files.id, id))
      .returning()
      .get();

    if (!result) {
      return c.json({
        status: 404,
        msg: "File not found",
        data: null
      }, 404);
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: result
    });
  } catch (error) {
    console.error("Error updating media file:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 删除媒体文件
secure.delete("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    // 先获取文件信息
    const file = await db
      .select()
      .from(media_files)
      .where(eq(media_files.id, id))
      .get();

    if (!file) {
      return c.json({
        status: 404,
        msg: "File not found",
        data: null
      }, 404);
    }

    // 从 R2 存储中删除文件
    await c.env.BUCKET.delete(file.path);

    // 从数据库中删除记录
    await db
      .delete(media_files)
      .where(eq(media_files.id, id))
      .execute();

    return c.json({
      status: 0,
      msg: "ok",
      data: null
    });
  } catch (error) {
    console.error("Error deleting media file:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 获取文件扩展名的辅助函数
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
}

// 临时文件上传
secure.post("/upload/tmp", async (c) => {
  const formData = await c.req.formData();
  const formFile = formData.get('file');
  
  if (!formFile || typeof formFile === 'string') {
    return c.json({
      status: 400,
      msg: "No file uploaded",
      data: null
    }, 400);
  }

  const file = formFile as unknown as FormDataFile;
  const contentType = getMimeType(file.name);
  console.log("File content type:", contentType);

  try {
    const buffer = await file.arrayBuffer();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${getFileExtension(file.name)}`;
    const tmpPath = `tmp_uploads/${fileName}`;

    await c.env.BUCKET.put(tmpPath, buffer, {
      httpMetadata: {
        contentType: contentType,
      }
    });

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        filename: fileName,
        path: tmpPath,
        originalName: file.name,
        size: buffer.byteLength,
        type: contentType
      }
    });
  } catch (error) {
    console.error("Error during file upload:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 确认上传
secure.post("/upload/confirm", async (c) => {
  const body = await c.req.json();
  const db = initDbConnect(c.env.DB);
  
  console.log("Confirm upload request body:", body);
  
  try {
    // 使用文件对象中的 path
    const tmpPath = body.file.path;
    console.log("Looking for temporary file at path:", tmpPath);

    // 从临时位置获取文件
    const tmpFile = await c.env.BUCKET.get(tmpPath);
    console.log("Temporary file found:", !!tmpFile);
    
    if (!tmpFile) {
      // 列出 bucket 中的所有文件用于调试
      const list = await c.env.BUCKET.list();
      console.log("Files in bucket:", list.objects.map(obj => obj.key));
      
      return c.json({
        status: 404,
        msg: "Temporary file not found",
        data: null
      }, 404);
    }

    // 生成正式路径
    const fileName = tmpPath.split('/').pop(); // 获取文件名
    const formalPath = `uploads/${fileName}`;
    console.log("Moving file to formal path:", formalPath);

    // 移动文件（在 R2 中实际上是复制然后删除）
    await c.env.BUCKET.put(formalPath, tmpFile.body, {
      httpMetadata: tmpFile.httpMetadata
    });
    console.log("File copied to formal path");
    
    await c.env.BUCKET.delete(tmpPath);
    console.log("Temporary file deleted");

    // 保存到数据库
    const result = await db
      .insert(media_files)
      .values({
        path: formalPath,
        content_type: body.file.type,
        size: body.file.size,
        description: body.description || null,
      })
      .returning()
      .get();

    console.log("Database record created:", result);

    return c.json({
      status: 0,
      msg: "ok",
      data: result
    });
  } catch (error) {
    console.error("Error confirming upload:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack
      });
    }
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 从 R2 获取资源
media.get("/local/*", async (c) => {
  // 从 URL 中获取文件路径，去掉 /local/ 前缀
  const key = c.req.path.replace("/v1/media/local/", "");
  
  try {
    // 从 R2 获取文件
    const file = await c.env.BUCKET.get(key);
    
    if (!file) {
      return c.json({
        status: 404,
        msg: "File not found",
        data: null
      }, 404);
    }

    // 获取文件内容
    const data = await file.arrayBuffer();

    // 返回文件，设置正确的 content-type
    return new Response(data, {
      headers: {
        'Content-Type': file.httpMetadata?.contentType || getMimeType(key),
        'Content-Length': file.size.toString(),
        'Cache-Control': 'public, max-age=31536000',
      },
    });

  } catch (error) {
    console.error("Error serving file from R2:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

media.route("/secure", secure);

export { media };