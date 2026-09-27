import { randomUUID } from 'node:crypto';
import { randomHex } from '../../../shared/utils/randomHex';
import { Webhook } from '../../../domain/entities/Webhook';
import type { IWebhookRepository } from '../../../domain/repositories/IWebhookRepository';

export interface CreateWebhookRequest {
  userId: string;
  url: string;
  events: string[];
}

export class CreateWebhookUseCase {
  constructor(private readonly webhookRepository: IWebhookRepository) {}

  async execute(request: CreateWebhookRequest): Promise<Webhook> {
    const { userId, url, events } = request;

    const webhook = new Webhook({
      id: randomUUID(),
      userId,
      url,
      events,
      secret: randomHex(24),
      isActive: true,
    });

    await this.webhookRepository.save(webhook);
    return webhook;
  }
}
