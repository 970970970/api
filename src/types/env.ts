export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  AI: Ai;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  JWT_SECRET: string;
  OPENAI_URL: string;
  DEEPSEEK_URL: string;
  SILICONFLOW_URL: string;
  AI_PROVIDER: string;
  DEEPSEEK_TOKEN: string;
  SILICONFLOW_TOKEN: string;
  DEEPSEEK_MODEL: string;
  SILICONFLOW_MODEL: string;
  QUEUE: Queue;
  // 添加其他必要的属性
}
