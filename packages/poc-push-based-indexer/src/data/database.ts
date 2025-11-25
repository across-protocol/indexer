import { UniTransfer } from "./entities";

/**
 * @file This file defines a simple in-memory database for the Proof-of-Concept.
 * In a production environment, this would be replaced by a robust database system
 * like PostgreSQL, and the queries would be handled by an ORM like TypeORM or Prisma.
 * This class simulates the data storage layer.
 */

/**
 * An in-memory database simulation.
 * It holds an array of transfer records in memory and provides a method to insert new ones.
 */
export class InMemoryDatabase {
  /**
   * Acts as our "transfers" table in the database.
   * @private
   */
  private transfers: UniTransfer[] = [];

  /**
   * Inserts a new transfer record into the in-memory database.
   *
   * In a real-world scenario, this method would perform an "UPSERT" operation
   * (e.g., `ON CONFLICT (transactionHash, logIndex) DO UPDATE`) to ensure idempotency,
   * which is crucial for handling events that might be delivered more than once by the
   * message queue.
   *
   * @param transfer The transfer object to be saved.
   * @param workerId A number identifying the processor worker, used here for logging purposes
   *                 to demonstrate concurrent processing.
   */
  async insertTransfer(transfer: UniTransfer, workerId: number) {
    // Simulate a database-generated ID and timestamp.
    const record = {
      ...transfer,
      id: this.transfers.length + 1,
      createdAt: new Date(),
    };
    this.transfers.push(record);

    // Log the saved record to the console for demonstration.
    console.log(
      `💾 [DB/Worker #${workerId}] Saved Uni Transfer with ID ${record.id} (Tx: ${record.transactionHash.slice(
        0,
        6,
      )}...)`,
    );
    console.log(`   ├─ From:   ${record.fromAddress}`);
    console.log(`   ├─ To:     ${record.toAddress}`);
    console.log(`   └─ Amount: ${record.amount}`);
  }
}
