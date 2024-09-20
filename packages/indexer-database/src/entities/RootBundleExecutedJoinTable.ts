import { Entity, PrimaryColumn } from "typeorm";

@Entity("bundle_executions")
export class RootBundleExecutedJoinTable {
  @PrimaryColumn()
  bundleId: number;

  @PrimaryColumn()
  executionId: number;
}