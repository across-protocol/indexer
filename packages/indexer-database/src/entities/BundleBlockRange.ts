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

  @Column({ nullable: false })
  chainId: number;

  @Column({ nullable: false })
  startBlock: number;

  @Column({ nullable: false })
  endBlock: number;
}
