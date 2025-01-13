import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity()
@Unique("UK_hp_baseCurrency_quoteCurrency_date", [
  "baseCurrency",
  "quoteCurrency",
  "date",
])
export class HistoricPrice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  baseCurrency: string;

  @Column({ default: "usd" })
  quoteCurrency: string;

  @Column({ type: "date" })
  date: Date;

  @Column({ type: "decimal" })
  price: string;

  @CreateDateColumn()
  createdAt: Date;
}
