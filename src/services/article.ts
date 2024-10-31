import { initDbConnect } from "../db/index";
import { articles, languages } from "../db/schema";
import { eq, and } from 'drizzle-orm';
import { llmService } from "./llm";
import { InferInsertModel, InferSelectModel } from 'drizzle-orm'; // 导入 InferInsertModel 和 InferSelectModel 类型

// 定义 Article 类型
type Article = InferSelectModel<typeof articles>;
type NewArticle = InferInsertModel<typeof articles>;

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  AI: Ai;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
  DEEPSEEK_URL: string;
  SILICONFLOW_URL: string;
  AI_PROVIDER: string;
  DEEPSEEK_TOKEN: string;
  SILICONFLOW_TOKEN: string;
  QUEUE: Queue;
  DEEPSEEK_MODEL: string;
  SILICONFLOW_MODEL: string;
};

export class articleService {
  private db: any;
  private llmServiceInstance: llmService;
  private queue: Queue;
  private env: Env;  // 添加这一行

  constructor(env: Env) {
    this.env = env;  // 添加这一行
    this.db = initDbConnect(env.DB);
    const apiUrl = this.getAiUrl(env);
    const apiToken = this.getAiToken(env);
    const model = this.getAiModel(env);
    this.llmServiceInstance = new llmService({ apiKey: apiToken, baseURL: apiUrl, model: model });
    this.queue = env.QUEUE;
  }

  private getAiUrl(env: Env): string {
    switch (env.AI_PROVIDER) {
      case 'DEEPSEEK':
        return env.DEEPSEEK_URL;
      case 'SILICONFLOW':
        return env.SILICONFLOW_URL;
      default:
        throw new Error(`Unknown AI provider: ${env.AI_PROVIDER}`);
    }
  }

  private getAiToken(env: Env): string {
    switch (env.AI_PROVIDER) {
      case 'DEEPSEEK':
        return env.DEEPSEEK_TOKEN;
      case 'SILICONFLOW':
        return env.SILICONFLOW_TOKEN;
      default:
        throw new Error(`Unknown AI provider: ${env.AI_PROVIDER}`);
    }
  }

  private getAiModel(env: Env): string {
    switch (env.AI_PROVIDER) {
      case 'DEEPSEEK':
        return env.DEEPSEEK_MODEL;
      case 'SILICONFLOW':
        return env.SILICONFLOW_MODEL;
      default:
        throw new Error(`Unknown AI provider: ${env.AI_PROVIDER}`);
    }
  }

  async createArticle(article: NewArticle) {
    const MAX_RANK = 10000;
    const normalizedArticle = {
      ...article,
      rank: MAX_RANK - (article.rank || 0) // 反转 rank 值
    };

    try {
      const result = await this.db
        .insert(articles)
        .values(normalizedArticle)
        .returning()
        .get();

      if (!result) {
        console.log("Article creation failed");
      }

      return result;
    } catch (error) {
      console.error("Error creating article:", error);
      throw error;
    }
  }

  async getArticleByID(id: number) {
    try {
      const article = await this.db
        .select()
        .from(articles)
        .where(eq(articles.id, id))
        .get();

      if (!article) {
        console.log("Article not found"); // 添加日志
        return null; // 返回 null 表示未找到
      }

      return article;
    } catch (error) {
      console.error("Error fetching article:", error);
      throw error;
    }
  }

  async getArticleByOriginIDAndLanguage(originID: number, language: string) {
    try {
      console.log("originID: ", originID)
      console.log("language: ", language)
      const article = await this.db
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.origin_id, originID),
            eq(articles.language, language)
          )
        )
        .get();

      if (!article) {
        console.log("Article not found");
        return null;
      }

      // 额外的检查
      if (article.origin_id !== originID || article.language !== language) {
        console.log("Unexpected article returned:", article);
        return null;
      }

      return article;
    } catch (error) {
      console.error("Error fetching article:", error);
      throw error;
    }
  }

  // 更新文章
  async updateArticle(article: Article) {
    try {
      const result = await this.db
        .update(articles)
        .set(article)
        .where(eq(articles.id, article.id))
        .returning()
        .execute();

      console.log("Article updated:", result);
      return result;
    } catch (error) {
      console.error("Error updating article:", error);
      throw error;
    }
  }

  // 初始化文章，步骤：1.获取文章内容，调用摘要函数获得文章摘要并保存。2.从数据库中获取英文语言对应的id，调用翻译函数将文章及摘要翻译成英文，并将结果在数据库中。3.将英文文章id发送到队列，并设置action为翻译
  async initArticle(id: number) {
    try {
      const article = await this.getArticleByID(id);

      if (!article) {
        console.log("Article not found");
        return null;
      }

      console.log("Article found:", article);
      console.log("AI Provider:", this.env.AI_PROVIDER);
      console.log("AI URL:", this.getAiUrl(this.env));

      //调用大模型获得摘要
      const summary = await this.llmServiceInstance.summary(article.content);
      console.log("Generated summary:", summary);

      article.summary = summary;
      await this.updateArticle(article);

      const languageslist = await this.db.select().from(languages)
      for (const language of languageslist) {
        if (language.name == "Chinese") {
          continue
        }
        const message = {
          id: id,
          category: "article",
          action: "translate",
          params: {
            language: language.name
          }
        }
        await this.queue.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error("Error in initArticle:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  }

  //翻译文章
  async translateArticle(id: number, language: string) {
    //从数据库中查找id为id的文章,没有找到直接返回
    const article = await this.getArticleByID(id);

    if (!article) {
      console.log("Article not found");
      return null;
    }

    console.log("target language: ", language)

    //调用大模型翻译接口，将标题、正文和摘要进行翻译
    const title = await this.llmServiceInstance.translate(article.title, article.language, language);
    console.log("translated title: ", title);
    //const content = "none"
    //const summary = "none"
    const summary = await this.llmServiceInstance.translate(article.summary, article.language, language);
    console.log("translated summary: ", summary);
    const content = await this.llmServiceInstance.translate(article.content, article.language, language);
    console.log("translated content: ", content);

    //从数据库中查找origin_id为id,language为language的文章，如果没有
    const translatedArticle = await this.getArticleByOriginIDAndLanguage(id, language);
    console.log("translatedArticle: ", translatedArticle);
    console.log("id: ", id)
    console.log("language: ", language)
    if (!translatedArticle) {
      const newArticle: NewArticle = {
        origin_id: id,
        language: language,
        content: content,
        summary: summary,
        title: title,
        category: article.category,
        image: article.image,
        rank: article.rank,
        published_at: article.published_at,
      }
      await this.createArticle(newArticle);
    } else {
      translatedArticle.title = title;
      translatedArticle.content = content;
      translatedArticle.summary = summary;
      console.log(await this.updateArticle(translatedArticle));
    }
  }

  getLlmServiceInstance(): llmService {
    return this.llmServiceInstance;
  }
}






