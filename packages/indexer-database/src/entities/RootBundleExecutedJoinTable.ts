import { Entity, PrimaryColumn } from "typeorm";

@Entity("bundle_executions", {synchronize: false})
export class RootBundleExecutedJoinTable {
  @PrimaryColumn()
  bundleId: number;

  @PrimaryColumn()
  executionId: number;
}
