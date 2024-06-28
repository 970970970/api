import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json'
import { artcile } from './api/article';
import { language } from './api/language';
import { utils } from './api/utils';
import { administrator } from './api/administrator';
import { media } from './api/media';
import { showRoutes } from 'hono/dev'

export type Env = {
	DB: D1Database;
	BUCKET: R2Bucket;
	CACHE: KVNamespace;
	ENV_TYPE: 'dev' | 'prod' | 'stage';
	JWT_SECRET: string;
};

const v1 = new Hono<{ Bindings: Env }>();
v1.route("/articles", artcile)
v1.route("/languages", language)
v1.route("/utils", utils)
v1.route("/administrator", administrator)
v1.route("/media", media)

const app = new Hono();
app.use(prettyJSON())
app.use('/v1/*',
	cors({
		origin: (origin, c) => {
			return origin
		},
		allowMethods: ['POST', 'PUT', 'DELETE', 'GET', 'OPTIONS'],
		exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
		allowHeaders: ['Content-Type', 'Authorization', 'Accept', 'Accept-Language', 'Access-Control-Request-Headers', 'Access-Control-Request-Method', 'Cache-Control', 'Connection', 'Origin', 'Pragma', 'Referer', 'Sec-Fetch-Mode', 'User-Agent'],
		maxAge: 600,
		credentials: true,
	})
)
app.notFound((c) => (
	c.json({
		status: 404,
		msg: 'Not Found',
	})
))
app.route('/v1', v1);
showRoutes(app, {
	verbose: true,
})

export default app