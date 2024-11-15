import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { brands, media_files } from "../db/schema";
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

// 公开的品牌列表接口
brand.get("/list", async (c) => {
  const db = initDbConnect(c.env.DB);
  const limit = Number(c.req.query('limit') || '20');
  const offset = Number(c.req.query('offset') || '0');
  const keywords = c.req.query('keywords');

  try {
    const query = db
      .select({
        id: brands.id,
        name: brands.name,
        description: brands.description,
        status: brands.status,
        logo_media_id: brands.logo_media_id,
        logo_path: media_files.path
      })
      .from(brands)
      .leftJoin(media_files, eq(brands.logo_media_id, media_files.id));

    // 如果有关键词，添加搜索条件
    const searchCondition = keywords ?
      or(
        sql`LOWER(${brands.name}) LIKE LOWER(${'%' + keywords + '%'})`,
        sql`LOWER(${brands.description}) LIKE LOWER(${'%' + keywords + '%'})`
      ) : undefined;

    // 获取总数
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(brands)
      .where(searchCondition)
      .get();

    // 获取分页数据
    const items = await query
      .where(searchCondition)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(brands.id))
      .execute();

    console.log(`Fetched ${items.length} brands, total: ${totalResult?.count || 0}`);

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        items,
        total: totalResult?.count || 0
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

// 热门搜索接口
brand.get("/hot-searches", async (c) => {
  const db = initDbConnect(c.env.DB);

  try {
    // 直接在数据库层面随机选择10个品牌
    const brandResults = await db
      .select({
        name: brands.name,
      })
      .from(brands)
      .orderBy(sql`RANDOM()`)
      .limit(10)
      .execute();

    const selected = brandResults.map(brand => brand.name);

    return c.json({
      status: 0,
      msg: "ok",
      data: selected
    });
  } catch (error) {
    console.error("Error fetching hot searches:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: []
    }, 500);
  }
});

// 品牌详情接口
brand.get("/:id{[0-9]+}", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    const brand = await db
      .select({
        id: brands.id,
        name: brands.name,
        description: brands.description,
        status: brands.status,
        logo_media_id: brands.logo_media_id,
        logo_path: media_files.path,
        reasons: brands.reasons,
        countries: brands.countries,
        categories: brands.categories,
        alternatives: brands.alternatives,
        stakeholders: brands.stakeholders
      })
      .from(brands)
      .leftJoin(media_files, eq(brands.logo_media_id, media_files.id))
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

// 获取单个品牌详情
secure.get("/:id{[0-9]+}", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    const brand = await db
      .select({
        id: brands.id,
        name: brands.name,
        description: brands.description,
        status: brands.status,
        logo_media_id: brands.logo_media_id,
        logo_path: media_files.path,
        reasons: brands.reasons,
        countries: brands.countries,
        categories: brands.categories,
        alternatives: brands.alternatives,
        stakeholders: brands.stakeholders
      })
      .from(brands)
      .leftJoin(media_files, eq(brands.logo_media_id, media_files.id))
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