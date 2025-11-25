/**
 * The standard ABI for the ERC20 `Transfer` event.
 *
 * This ABI (Application Binary Interface) fragment defines the signature of the `Transfer` event,
 * which is emitted by standard ERC20 tokens when tokens are moved.
 *
 * The `indexed` keyword for `from` and `to` allows for efficient filtering of these events
 * on the blockchain.
 *
 * By defining this here, the generic indexer can decode `Transfer` event logs
 * from any ERC20 token contract without needing its full ABI.
 */
export const ERC20_TRANSFER_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
