import { Hono } from 'hono';
import { OpenAI } from 'openai';
import { getSummaryPrompt, getTranslationPrompt } from '../prompts/prompts'
import { llmService } from "../services/llm";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  AI: Ai;
  ENV_TYPE: 'dev' | 'prod' | 'stage';
  OPENAI_URL: string;
  DEEPSEEK_TOKEN: string;
  TASK: { add: (a: number, b: number) => number };
};

export const ai = new Hono<{ Bindings: Env }>()

ai.all("/", async (c) => {
  return c.json({ status: 0, msg: 'ok', data: "ai" })
})

ai.post("/openai_summarize", async (c) => {
  const body = await c.req.json();
  const text = body.text
  const length = body.length || 100

  const openai = new OpenAI({
    apiKey: c.env.DEEPSEEK_TOKEN,
    baseURL: c.env.OPENAI_URL
  });

  const systemPrompt = getSummaryPrompt(length);
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: text }
  ];

  const completion = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: messages,
  });

  console.log(completion.choices[0].message.content);

  return c.json({ status: 0, msg: 'ok', data: completion.choices[0].message.content })
})

ai.post("/openai_translate", async (c) => {
  const body = await c.req.json();
  const text = body.text
  const fromLang = body.from
  const toLang = body.to

  const llmServiceInstance = new llmService({ apiKey: c.env.DEEPSEEK_TOKEN, baseURL: c.env.OPENAI_URL });
  const content = await llmServiceInstance.translate(text, fromLang, toLang);

  console.log(content);
  return c.json({ status: 0, msg: 'ok', data: content })
})

