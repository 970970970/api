export class ArticleProcessor {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    // 实现处理逻辑
    return new Response('OK');
  }
} 