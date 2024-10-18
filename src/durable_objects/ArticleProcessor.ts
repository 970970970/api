import { DurableObject, DurableObjectState } from "@cloudflare/workers-types";
import { articleService } from '../services/article';
import { Env } from '../types/env';

export class ArticleProcessor implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);

    switch (path[0]) {
      case 'initArticle':
        return this.handleInitArticle(request);
      case 'translateArticle':
        return this.handleTranslateArticle(request);
      case 'setAiProvider':
        return this.handleSetAiProvider(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleInitArticle(request: Request): Promise<Response> {
    const { id } = await request.json() as { id: number };
    const result = await this.initArticle(id);
    return new Response(result);
  }

  private async handleTranslateArticle(request: Request): Promise<Response> {
    const { id, language } = await request.json() as { id: number; language: string };
    const result = await this.translateArticle(id, language);
    return new Response(result);
  }

  private async handleSetAiProvider(request: Request): Promise<Response> {
    const { provider } = await request.json() as { provider: string };
    const result = await this.setAiProvider(provider);
    return new Response(result);
  }

  async initArticle(id: number): Promise<string> {
    const articleServiceInstance = new articleService(this.env);
    await articleServiceInstance.initArticle(id);
    return 'Article initialized';
  }

  async translateArticle(id: number, language: string): Promise<string> {
    const articleServiceInstance = new articleService(this.env);
    await articleServiceInstance.translateArticle(id, language);
    return 'Article translated';
  }

  async setAiProvider(provider: string): Promise<string> {
    if (provider !== 'DEEPSEEK' && provider !== 'SILICONFLOW') {
      throw new Error(`Invalid AI provider: ${provider}`);
    }
    this.env.AI_PROVIDER = provider;
    return `AI provider set to ${provider}`;
  }
}

// 修改这个类型声明
export type ArticleProcessorType = DurableObject;
