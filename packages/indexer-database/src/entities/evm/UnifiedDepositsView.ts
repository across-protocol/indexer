import { ViewEntity, ViewColumn, PrimaryColumn } from "typeorm";

@ViewEntity({
  schema: "evm",
  name: "unified_deposits_view",
  expression: `SELECT * FROM "evm"."unified_deposits_view"`,
  materialized: false, // This is a virtual view wrapper around the materialized views
})
export class UnifiedDepositsView {
  @ViewColumn()
  type: "across" | "cctp" | "oft";

  @PrimaryColumn()
  @ViewColumn()
  unique_id: string;

  @ViewColumn()
  original_id: number;

  @ViewColumn()
  timestamp: Date;

  @ViewColumn()
  sender: string;

  @ViewColumn()
  recipient: string | null; // Nullable (e.g. for unfilled OFT deposits)

  @ViewColumn()
  inputToken: string;

  @ViewColumn()
  outputToken: string | null; // Nullable (e.g. for unfilled CCTP/OFT deposits)

  @ViewColumn()
  amount: string;

  @ViewColumn()
  originChainId: string;

  @ViewColumn()
  destinationChainId: string | null;

  @ViewColumn()
  status: string;

  @ViewColumn()
  depositTxHash: string;

  @ViewColumn()
  blockNumber: number;

  @ViewColumn()
  fillTxHash: string | null; // Nullable (populated when status is 'Filled')

  @ViewColumn()
  refundTxHash: string | null; // Nullable (populated only for Across refunds)
}
