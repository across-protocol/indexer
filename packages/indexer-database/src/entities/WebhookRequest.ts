import {
  Entity,
  PrimaryColumn,
  Column,
  Unique,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity()
@Unique("UK_webhook_request_clientId_filter", ["clientId", "filter"])
@Index("IX_webhook_request_filter", ["filter"])
export class WebhookRequest {
  @PrimaryColumn()
  id: string;

  @Column({ type: "integer" })
  clientId: number;

  @Column()
  url: string;

  @Column()
  filter: string;

  @CreateDateColumn()
  createdAt: Date;
}
