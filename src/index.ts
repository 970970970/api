import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json'
import { showRoutes } from 'hono/dev';
import { article } from './api/article';
import { language } from './api/language';
import { ai } from './api/ai';
import { utils } from './api/utils';
import { brand } from './api/brand';
import { syncBrands } from './tasks/sync-brands';
import { ArticleProcessor } from './workers/article-processor';
import { media } from './api/media';
import { administrator } from './api/administrator';

// 扩展 Env 类型
export interface Env {
	DB: D1Database;
	BUCKET: R2Bucket;
	CACHE: KVNamespace;
	ENV_TYPE: 'dev' | 'prod' | 'stage';
	JWT_SECRET: string;
	QUEUE: Queue;
	ARTICLE_PROCESSOR: DurableObjectNamespace;
}

const app = new Hono<{ Bindings: Env }>();

app.use(prettyJSON())
app.use('/v1/*',
	cors({
		origin: (origin) => origin,
		allowMethods: ['POST', 'PUT', 'DELETE', 'GET', 'OPTIONS'],
		exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
		allowHeaders: ['Content-Type', 'Authorization', 'Accept', 'Accept-Language', 'Access-Control-Request-Headers', 'Access-Control-Request-Method', 'Cache-Control', 'Connection', 'Origin', 'Pragma', 'Referer', 'Sec-Fetch-Mode', 'User-Agent'],
		maxAge: 600,
		credentials: true,
	})
)

app.notFound((c) => c.json({ status: 404, msg: 'Not Found' }))

app.route('/v1/ai', ai)
app.route('/v1/articles', article)
app.route('/v1/languages', language)
app.route('/v1/utils', utils)
app.route('/v1/brands', brand)
app.route('/v1/media', media)
app.route('/v1/administrator', administrator)

// 注册定时任务处理器
app.get("/tasks/sync-brands", async (c) => {
	const result = await syncBrands(c.env);
	return c.json(result);
});

showRoutes(app, { verbose: true })

type ActionHandler = (data: any, env: Env) => Promise<void>;

interface ActionMap {
	[category: string]: {
		[action: string]: ActionHandler;
	};
}

const actionMap: ActionMap = {
	article: {
		init: async (data, env) => {
			const id = env.ARTICLE_PROCESSOR.idFromName('article-' + data.id);
			const stub = env.ARTICLE_PROCESSOR.get(id);
			await stub.fetch('http://dummy-url/initArticle', {
				method: 'POST',
				body: JSON.stringify({ id: data.id })
			});
		},
		translate: async (data, env) => {
			const id = env.ARTICLE_PROCESSOR.idFromName('article-' + data.id);
			const stub = env.ARTICLE_PROCESSOR.get(id);
			await stub.fetch('http://dummy-url/translateArticle', {
				method: 'POST',
				body: JSON.stringify({ id: data.id, language: data.params.language })
			});
		},
	},
};

export default {
	fetch: app.fetch,
	async queue(batch: MessageBatch<any>, env: Env) {
		const promises = batch.messages.map(async (message) => {
			try {
				const body = message.body;
				const data = JSON.parse(body);
				const { category, action } = data;
				console.log(data);

				const handler = actionMap[category]?.[action];
				if (handler) {
					try {
						await handler(data, env);
						message.ack();
						console.log('操作成功');
					} catch (error) {
						message.retry();
						console.error('操作失败:', error);
					}
				} else {
					console.error(`未找到类别: ${category}, 动作: ${action} 的处理函数`);
				}
			} catch (error) {
				console.error(`处理消息时出错:`, error);
			}
		});

		await Promise.all(promises);
	},
	ArticleProcessor,
	// 处理定时触发
	scheduled: async (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
		ctx.waitUntil(syncBrands(env));
	},
};

export { ArticleProcessor };
