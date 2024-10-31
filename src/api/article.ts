import { Hono } from 'hono';
import { initDbConnect } from "../db/index";
import { articles, article_mods, mods } from "../db/schema";
import { jwt } from 'hono/jwt'
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
};

const artcile = new Hono<{ Bindings: Env }>()
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

secure.get("/:id{[0-9]+}", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    // 先获取文章关联的模块ID列表
    const articleMods = await db
      .select({
        mod_id: article_mods.mod_id
      })
      .from(article_mods)
      .where(eq(article_mods.article_id, id))
      .execute();

    // 获取文章信息
    const article = await db
      .select()
      .from(articles)
      .where(eq(articles.id, id))
      .get();

    if (!article) {
      return c.notFound()
    }

    // 提取模块 ID 列表
    const modIds = articleMods.map(am => am.mod_id);

    return c.json({ 
      status: 0, 
      msg: "ok", 
      data: {
        ...article,
        mods: modIds
      }
    });
  } catch (error) {
    console.error("Error fetching article:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

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

  // 获取分页参数
  const limit = parseInt(c.req.query('limit') || '10');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    // 获取总数
    const totalCount = await db
      .select({
        value: sql<number>`count(*)`
      })
      .from(articles)
      .get();

    // 获取分页数据
    const items = await db
      .select({
        id: articles.id,
        origin_id: articles.origin_id,
        title: articles.title,
        content: articles.content,
        summary: articles.summary,
        image: articles.image,
        language: articles.language,
        published_at: articles.published_at,
        rank: articles.rank
      })
      .from(articles)
      .orderBy(desc(articles.published_at))
      .limit(limit)
      .offset(offset)
      .execute();

    return c.json({
      status: 0,
      msg: 'ok',
      data: {
        items: items,
        total: totalCount?.value || 0
      }
    });
  } catch (error) {
    console.error("Error fetching articles:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 修改文章列表接口
artcile.get("/list/:mod/:language", async (c) => {
  const db = initDbConnect(c.env.DB);
  const modId = Number(c.req.param('mod'));
  const language = c.req.param('language');

  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '10');
  const offset = (page - 1) * pageSize;

  try {
    // 修改查询总数的方式
    const totalCount = await db
      .select({
        value: sql<number>`count(DISTINCT ${articles.id})`
      })
      .from(articles)
      .leftJoin(article_mods, eq(articles.id, article_mods.article_id))
      .where(
        and(
          eq(article_mods.mod_id, modId),
          eq(articles.language, language)
        )
      )
      .get();

    // 查询文章列表
    const articleList = await db
      .select({
        id: articles.id,
        title: articles.title,
        summary: articles.summary,
        image: articles.image,
        published_at: articles.published_at
      })
      .from(articles)
      .leftJoin(article_mods, eq(articles.id, article_mods.article_id))
      .where(
        and(
          eq(article_mods.mod_id, modId),
          eq(articles.language, language)
        )
      )
      .orderBy(desc(articles.rank), desc(articles.published_at))
      .limit(pageSize)
      .offset(offset)
      .execute();

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        total: totalCount?.value || 0,
        page,
        pageSize,
        list: articleList
      }
    });
  } catch (error) {
    console.error("Error fetching article list:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 获取单篇文章（公开接口）
artcile.get("/:id{[0-9]+}", async (c) => {
  console.log('get article by id')
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    const article = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        summary: articles.summary,
        image: articles.image,
        language: articles.language,
        published_at: articles.published_at
      })
      .from(articles)
      .where(eq(articles.id, id))
      .get();

    if (!article) {
      return c.json({
        status: 404,
        msg: "Article not found",
        data: null
      }, 404);
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: article
    });
  } catch (error) {
    console.error("Error fetching article:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 添加 mods 相关的接口
secure.get("/mods", async (c) => {
  const db = initDbConnect(c.env.DB);
  const limit = parseInt(c.req.query('limit') || '10');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    // 获取总数
    const totalCount = await db
      .select({
        value: sql<number>`count(*)`
      })
      .from(mods)
      .get();

    // 获取分页数据
    const items = await db
      .select()
      .from(mods)
      .orderBy(desc(mods.id))
      .limit(limit)
      .offset(offset)
      .execute();

    return c.json({
      status: 0,
      msg: 'ok',
      data: {
        items: items,
        total: totalCount?.value || 0
      }
    });
  } catch (error) {
    console.error("Error fetching mods:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 获取单个模块
secure.get("/mods/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    const mod = await db
      .select()
      .from(mods)
      .where(eq(mods.id, id))
      .get();

    if (!mod) {
      return c.json({
        status: 404,
        msg: "Mod not found",
        data: null
      }, 404);
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: mod
    });
  } catch (error) {
    console.error("Error fetching mod:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 创建模块
secure.post("/mods", async (c) => {
  const db = initDbConnect(c.env.DB);
  const body = await c.req.json();

  try {
    const mod = await db
      .insert(mods)
      .values({
        code: body.code,
        name: body.name,
        description: body.description || null,
        status: body.status || 1
      })
      .returning()
      .execute();

    return c.json({
      status: 0,
      msg: "ok",
      data: mod
    });
  } catch (error) {
    console.error("Error creating mod:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 更新模块
secure.put("/mods/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  try {
    const mod = await db
      .update(mods)
      .set({
        code: body.code,
        name: body.name,
        description: body.description,
        status: body.status
      })
      .where(eq(mods.id, id))
      .returning()
      .execute();

    if (!mod.length) {
      return c.json({
        status: 404,
        msg: "Mod not found",
        data: null
      }, 404);
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: mod[0]
    });
  } catch (error) {
    console.error("Error updating mod:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 删除模块
secure.delete("/mods/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));

  try {
    // 首先删除关联表中的数据
    await db
      .delete(article_mods)
      .where(eq(article_mods.mod_id, id))
      .execute();

    // 然后删除模块
    const result = await db
      .delete(mods)
      .where(eq(mods.id, id))
      .returning()
      .execute();

    if (!result.length) {
      return c.json({
        status: 404,
        msg: "Mod not found",
        data: null
      }, 404);
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: null
    });
  } catch (error) {
    console.error("Error deleting mod:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 更新模块状态
secure.put("/mods/:id/status", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  try {
    const mod = await db
      .update(mods)
      .set({
        status: body.status
      })
      .where(eq(mods.id, id))
      .returning()
      .execute();

    if (!mod.length) {
      return c.json({
        status: 404,
        msg: "Mod not found",
        data: null
      }, 404);
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: mod[0]
    });
  } catch (error) {
    console.error("Error updating mod status:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 获取文章的模块选项和当前选中的模块
secure.get("/article-mods/:id", async (c) => {
  const db = initDbConnect(c.env.DB);
  const articleId = Number(c.req.param('id'));

  try {
    // 获取所有可用的模块
    const allMods = await db
      .select({
        id: mods.id,
        name: mods.name
      })
      .from(mods)
      .where(eq(mods.status, 1))
      .execute();

    // 获取文章当前选中的模块
    const selectedMods = await db
      .select({
        mod_id: article_mods.mod_id
      })
      .from(article_mods)
      .where(eq(article_mods.article_id, articleId))
      .execute();

    // 转换为所需的格式
    const options = allMods.map(mod => ({
      label: mod.name,
      value: mod.id.toString() // 转为字符串以符合 amis 要求
    }));

    // 转换选中值为逗号分隔的字符串
    const value = selectedMods.map(m => m.mod_id.toString()).join(',');

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        options: options,
        value: value
      }
    });
  } catch (error) {
    console.error("Error fetching article mods:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 更新文章
secure.put("/:id{[0-9]+}", async (c) => {
  const db = initDbConnect(c.env.DB);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  try {
    // 开始事务
    // 1. 更新文章基本信息
    const article = await db
      .update(articles)
      .set({
        title: body.title,
        content: body.content,
        summary: body.summary,
        image: body.image,
        rank: body.rank,
        language: body.language
      })
      .where(eq(articles.id, id))
      .returning()
      .execute();

    if (!article.length) {
      return c.json({
        status: 404,
        msg: "Article not found",
        data: null
      }, 404);
    }

    // 2. 更新文章模块关联
    // 先删除旧的关联
    await db
      .delete(article_mods)
      .where(eq(article_mods.article_id, id))
      .execute();

    // 添加新的关联
    if (body.mods) {
      const modIds = body.mods.split(',').map(Number);
      for (const modId of modIds) {
        await db
          .insert(article_mods)
          .values({
            article_id: id,
            mod_id: modId
          })
          .execute();
      }
    }

    return c.json({
      status: 0,
      msg: "ok",
      data: article[0]
    });
  } catch (error) {
    console.error("Error updating article:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

// 获取所有可用的模块选项
secure.get("/mod-options", async (c) => {
  const db = initDbConnect(c.env.DB);

  try {
    // 获取所有启用的模块
    const allMods = await db
      .select({
        id: mods.id,
        name: mods.name
      })
      .from(mods)
      .where(eq(mods.status, 1))
      .execute();

    // 转换为 amis 需要的格式
    const options = allMods.map(mod => ({
      label: mod.name,
      value: mod.id.toString() // 转为字符串以符合 amis 要求
    }));

    return c.json({
      status: 0,
      msg: "ok",
      data: {
        options: options
      }
    });
  } catch (error) {
    console.error("Error fetching mod options:", error);
    return c.json({
      status: 500,
      msg: "Internal server error",
      data: null
    }, 500);
  }
});

artcile.route("/secure", secure)

export { artcile }