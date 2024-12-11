import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

@Entity()
@Unique("UK_historic_price_baseCurrency_quoteCurrency_date", [
  "baseCurrency",
  "quoteCurrency",
  "date",
])
export class HistoricPrice {
  @PrimaryGeneratedColumn()
  id: number;

  // bear in mind we are using coingecko symbols directly here, for all intents and purposes this is coingecko historic market price
  @Column()
  baseCurrency: string;

  @Column({ default: "usd" })
  quoteCurrency: string;

  // yyyy-LL-dd
  @Column()
  date: string;

  @Column({ type: "decimal" })
  price: string;

  @CreateDateColumn()
  createdAt: Date;
}
