import { Entity, PrimaryColumn, Column, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class WebhookClient {
  @Column()
  name: string;

  @PrimaryGeneratedColumn()
  id: string;

  @Column({ unique: true })
  apiKey: string;

  @Column("jsonb")
  domains: string[];
}
