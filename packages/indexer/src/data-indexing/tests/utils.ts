import sinon from "sinon";

import * as contractUtils from "../../utils/contractUtils";

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
