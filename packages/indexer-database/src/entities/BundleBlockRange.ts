import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Bundle } from "./Bundle";

@Entity()
@Unique("UK_bundleBlockRange_bundleId_chainId", ["bundleId", "chainId"])
export class BundleBlockRange {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Bundle, (bundle) => bundle.ranges, { nullable: false })
  bundle: Bundle;

  @Column({ nullable: false })
  bundleId: number;

  @Column({ type: "bigint", nullable: false })
  chainId: string;

  @Column({ nullable: false })
  startBlock: number;

  @Column({ nullable: false })
  endBlock: number;
}
