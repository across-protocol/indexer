import { Entity, Column, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity()
@Unique("UK_webhook_client_api_key", ["apiKey"])
export class WebhookClient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  apiKey: string;

  @Column("jsonb")
  domains: string[];
}
