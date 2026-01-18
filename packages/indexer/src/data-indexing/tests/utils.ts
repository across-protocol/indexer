import * as contractUtils from "../../utils/contractUtils";
import sinon from "sinon";
import { Repository, FindOptionsWhere, ObjectLiteral } from "typeorm";

export const stubContractUtils = (
  contractName: string,
  mockAddress: string,
  chainId?: number,
) => {
  const functionName = `get${contractName}Address`;
  const stub = sinon.stub(contractUtils as any, functionName);
  if (chainId) {
    stub.withArgs(chainId).returns(mockAddress);
  } else {
    stub.returns(mockAddress);
  }
};

/**
 * Request object for waitForEventToBeStoredOrFail.
 * @template T The type of the entity to be searched for.
 * @property {Repository<T>} repository - The repository to search in.
 * @property {FindOptionsWhere<T>} findOptions - The search criteria.
 * @property {number} [timeout=10000] - The timeout in milliseconds.
 * @property {number} [interval=100] - The interval in milliseconds.
 */
export type WaitForEventToBeStoredOrFailRequest<T extends ObjectLiteral> = {
  repository: Repository<T>;
  findOptions: FindOptionsWhere<T>;
  timeout?: number;
  interval?: number;
};

/**
 * Waits for a certain event to be stored in the database or fails after a given timeout.
 * @param request The request object containing the repository, search criteria, and timeout options.
 * @returns The found event entity.
 * @throws Error if the event is not found within the timeout.
 */
export async function waitForEventToBeStoredOrFail<T extends ObjectLiteral>(
  request: WaitForEventToBeStoredOrFailRequest<T>,
): Promise<T> {
  const { repository, findOptions, timeout = 10000, interval = 100 } = request;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const found = await repository.findOne({ where: findOptions });
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Event not found within ${timeout}ms using options: ${JSON.stringify(
      findOptions,
    )}`,
  );
}
