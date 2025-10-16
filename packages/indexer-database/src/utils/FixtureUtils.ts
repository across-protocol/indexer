export const getRandomInt = (min = 0, max = 1000000) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getMockedEvmTransactionHash = () => {
  const characters = "0123456789abcdef";
  let hash = "0x";

  // Generate 64 random hex characters
  for (let i = 0; i < 64; i++) {
    hash += characters[Math.floor(Math.random() * characters.length)];
  }

  return hash;
};

export const getMockedEvmAddress = () => {
  // EVM addresses are 20 bytes (40 characters) long, prefixed with 0x
  const characters = "0123456789abcdef";
  let address = "0x";

  // Generate 40 random hex characters
  for (let i = 0; i < 40; i++) {
    address += characters[Math.floor(Math.random() * characters.length)];
  }

  return address;
};
