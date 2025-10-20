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
