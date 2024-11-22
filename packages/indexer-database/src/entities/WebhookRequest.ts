import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class WebhookRequest {
  @PrimaryColumn()
  id: string;

  @Column()
  url: string;

  @Column()
  filter: string;

  @Column({ type: "text", nullable: true, default: undefined })
  clientId?: string | undefined;
}
