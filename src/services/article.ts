import { initDbConnect } from "../db/index";
import { articles, languages } from "../db/schema";
import { eq } from 'drizzle-orm';
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
  OPENAI_URL: string;
  DEEPSEEK_TOKEN: string;
  QUEUE: Queue;
};

export class articleService {
  private db: any;
  private llmServiceInstance: llmService;
  private queue: Queue;

  constructor(env: Env) {
    this.db = initDbConnect(env.DB);
    this.llmServiceInstance = new llmService({ apiKey: env.DEEPSEEK_TOKEN, baseURL: env.OPENAI_URL });
    this.queue = env.QUEUE;
  }

  async createArticle(article: NewArticle) {
    try {
      const result = await this.db
        .insert(articles)
        .values(article)
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
      const article = await this.db
        .select()
        .from(articles)
        .where(eq(articles.origin_id, originID))
        .where(eq(articles.language, language))
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

      console.log(article);
      //调用大模型获得摘要

      const summary = await this.llmServiceInstance.summary(article.content);
      console.log(summary);

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
}


