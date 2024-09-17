import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json'
import { artcile } from './api/article';
import { language } from './api/language';
import { ai } from './api/ai';
import { utils } from './api/utils';
import { administrator } from './api/administrator';
import { media } from './api/media';
import { showRoutes } from 'hono/dev'
import { articleService } from './services/article'; // 导入 articleService
import { initDbConnect } from "./db/index";
import { articles as Article } from "./db/schema";
import { eq } from 'drizzle-orm';

export type Env = {
	DB: D1Database;
	BUCKET: R2Bucket;
	CACHE: KVNamespace;
	AI: Ai;
	ENV_TYPE: 'dev' | 'prod' | 'stage';
	JWT_SECRET: string;
	OPENAI_URL: string;
	DEEPSEEK_TOKEN: string;
	//QUEUE: Queue;
};

const v1 = new Hono<{ Bindings: Env }>();
v1.route("/ai", ai)
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

type ActionHandler = (data: any, env: any) => Promise<void>; // 修改 ActionHandler 类型定义

interface ActionMap {
	[category: string]: {
		[action: string]: ActionHandler;
	};
}

const actionMap: ActionMap = {
	article: {
		init: async (data, env) => {
			const articleServiceInstance = new articleService(env);
			await articleServiceInstance.initArticle(data.id);
		},
		translate: async (data, env) => {
			const articleServiceInstance = new articleService(env);
			await articleServiceInstance.translateArticle(data.id, data.params.language);
		}
		// 根据需要添加更多 'article' 类别的动作
	},
	// 根据需要添加更多类别
};

export default {
	fetch: app.fetch,
	async queue(batch: MessageBatch<string>, env: any) {
		const promises = batch.messages.map(async (message) => {
			try {
				const body = message.body;
				// 解析 JSON 字符串
				const data = JSON.parse(body);
				const { category, action } = data;
				console.log(data);

				// 根据 category 和 action 调用相应的处理函数
				const handler = actionMap[category]?.[action];
				if (handler) {
					try {

						const timeout = 600000; // 600 秒
						const timeoutPromise = new Promise((_, reject) => {
							setTimeout(() => {
								reject(new Error('操作超时'));
							}, timeout);
						});

						const result = await Promise.race([
							handler(data, env),
							timeoutPromise
						]);

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
				// 可以选择在这里处理错误，例如记录日志或重试
			}
		});

		// 等待所有消息处理完成
		await Promise.all(promises);
	}
}
