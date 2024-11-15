export function asyncInterval(fn: () => Promise<void>, delay: number) {
  let isStopped = false;

  async function run() {
    while (!isStopped) {
      await fn();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  run();

  return () => {
    isStopped = true;
  };
}
