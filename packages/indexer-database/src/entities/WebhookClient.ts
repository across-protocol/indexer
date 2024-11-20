import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class WebhookClient {
  @Column()
  name: string;

  @PrimaryColumn()
  id: string;

  @Column()
  apiKey: string;

  @Column("simple-array")
  domains: string[];
}
