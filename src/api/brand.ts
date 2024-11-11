import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { brands } from "../db/schema";
import { jwt } from 'hono/jwt'
import { eq, desc, or, like, and, sql } from 'drizzle-orm';

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
};

const brand = new Hono<{ Bindings: Env }>();
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

// 获取品牌列表
secure.get("/", async (c) => {
  const db = initDbConnect(c.env.DB);
  const page = Number(c.req.query('page') || '1');
  const pageSize = Number(c.req.query('pageSize') || '10');
  const search = c.req.query('search');
  const entityType = c.req.query('entity_type');
  const status = c.req.query('status');

  try {
    // 构建基础查询
    const query = db.select().from(brands);

    // 构建条件
    const whereConditions = [];
    if (search) {
      whereConditions.push(like(brands.name, `%${search}%`));
    }
    if (entityType) {
      whereConditions.push(eq(brands.entity_type, entityType));
    }
    if (status) {
      whereConditions.push(eq(brands.status, status));
    }

    // 应用条件
    const finalQuery = whereConditions.length > 0
      ? query.where(and(...whereConditions))
      : query;

    // 获取总数
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(brands)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .get();

    // 获取分页数据
    const items = await finalQuery
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .orderBy(desc(brands.id))
      .execute();

    console.log('Query result:', {
      total: totalResult?.count || 0,
      page,
      pageSize,
      itemCount: items.length
    });

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        items,
        total: totalResult?.count || 0,
        page,
        pageSize
      }
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 获取单个品牌详情
secure.get("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    const brand = await db
      .select()
      .from(brands)
      .where(eq(brands.id, id))
      .get();

    if (!brand) {
      return c.json({
        status: 404,
        msg: "Brand not found",
        data: null
      }, 404);
    }

    // 解析 JSON 字符串字段
    const result = {
      ...brand,
      reasons: brand.reasons ? JSON.parse(brand.reasons) : [],
      countries: brand.countries ? JSON.parse(brand.countries) : [],
      categories: brand.categories ? JSON.parse(brand.categories) : [],
      alternatives: brand.alternatives ? JSON.parse(brand.alternatives) : [],
      stakeholders: brand.stakeholders ? JSON.parse(brand.stakeholders) : []
    };

    return c.json({
      status: 0,
      msg: "ok",
      data: result
    });
  } catch (error) {
    console.error("Error fetching brand:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 更新品牌
secure.put("/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  try {
    const result = await db
      .update(brands)
      .set({
        name: body.name,
        description: body.description,
        status: body.status,
        entity_type: body.entity_type,
        reasons: JSON.stringify(body.reasons || []),
        countries: JSON.stringify(body.countries || []),
        categories: JSON.stringify(body.categories || []),
        website: body.website,
        logo_url: body.logo_url,
        alternatives: JSON.stringify(body.alternatives || []),
        alternatives_text: body.alternatives_text,
        stakeholders: JSON.stringify(body.stakeholders || []),
        updated_at: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(brands.id, id))
      .returning()
      .get();

    if (!result) {
      return c.json({
        status: 404,
        msg: "Brand not found",
        data: null
      }, 404);
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: result
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 将安全路由挂载到主路由
brand.route("/secure", secure);

export { brand }; 