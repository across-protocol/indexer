import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class WebhookRequest {
  @PrimaryColumn()
  id: string;

  @Column()
  url: string;

  @Column()
  filter: string;
}
