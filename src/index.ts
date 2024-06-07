import { Hono } from 'hono';
import { articles } from "./db/schema";
import { initDbConnect } from "./db/index";
import { eq } from "drizzle-orm";
import { HTTPException } from 'hono/http-exception'
import { prettyJSON } from 'hono/pretty-json'

export type Env = {
	DB: D1Database;
	BUCKET: R2Bucket;
	CACHE: KVNamespace;
	ENV_TYPE: 'dev' | 'prod' | 'stage';
};

const v1 = new Hono<{ Bindings: Env }>();
v1.get("/articles", async (c) => {
	const db = initDbConnect(c.env.DB);
	const allarticles = await db.select().from(articles).all();
	return c.json(allarticles);
}).get("/article/:id", async (c) => {
	const db = initDbConnect(c.env.DB);
	const id = Number(c.req.param('id'));
	const article = await db.query.articles.findFirst({ where: (article, { eq }) => eq(article.id, id) });
	if (!article) {
		return c.notFound()
	}
	return c.json({ status: 'ok', data: article });
})

const app = new Hono();
app.use(prettyJSON())
app.notFound((c) => (
	c.json({ message: 'Not Found', status: "error", code: 404 }, 404))
);
app.route('/v1', v1);

export default app