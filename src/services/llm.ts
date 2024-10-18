import OpenAI from 'openai';
import { getSummaryPrompt, getTranslationPrompt } from '../prompts/prompts'

export class llmService {
  private openai: OpenAI;
  private model: string;

  constructor(options: { apiKey: string; baseURL: string; model: string }) {
    this.openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: 1500000,
    });
    this.model = options.model;
  }

  async summary(text: string, length: number = 100): Promise<string> {
    const systemPrompt = getSummaryPrompt(length);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ];

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: messages,
      temperature: 0.5,
    }, {
      timeout: 1500000,
    });

    const content = completion.choices[0].message.content;
    if (content === null) {
      throw new Error("OpenAI API returned null content");
    }

    return content;
  }

  async translate(text: string, fromLang: string, toLang: string): Promise<string> {
    const systemPrompt = getTranslationPrompt(fromLang, toLang);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ];

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: messages,
      temperature: 0.5,
    }, {
      timeout: 1500000,
    });

    const content = completion.choices[0].message.content;
    if (content === null) {
      throw new Error("OpenAI API returned null content");
    }

    return content;
  }
}
