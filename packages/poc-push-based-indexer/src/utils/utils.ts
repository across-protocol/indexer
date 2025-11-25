/**
 * A topic-based in-memory queue that supports blocking reads.
 * Simulates a Topic Exchange (RabbitMQ) for the PoC.
 * * GUARANTEES:
 * 1. Isolation: Events on topic A do not block or interfere with topic B.
 * 2. FIFO per Topic: Ordering is preserved within a specific topic.
 * 3. Exact Delivery: One item is processed by exactly one worker for that topic.
 */
export class AsyncQueue<T> {
  // Map<TopicName, ArrayOfItems>
  private queues: Map<string, T[]> = new Map();
  // Map<TopicName, ArrayOfWaitingPromises>
  private waiters: Map<string, ((item: T) => void)[]> = new Map();

  /**
   * Adds an item to a specific topic.
   * The routing key format is typically: {chainId}.{contractAddress}.{EventName}
   */
  push(topic: string, item: T) {
    const topicWaiters = this.waiters.get(topic) || [];

    if (topicWaiters.length > 0) {
      // Immediate dispatch to a waiting worker for this topic
      const waiter = topicWaiters.shift();
      waiter!(item);
    } else {
      // Store in the specific topic queue
      const topicItems = this.queues.get(topic) || [];
      topicItems.push(item);
      this.queues.set(topic, topicItems);
    }
  }

  /**
   * Blocking read for a specific topic.
   * Workers subscribe to a specific topic and wait for events.
   */
  async pop(topic: string): Promise<T> {
    const topicItems = this.queues.get(topic) || [];

    if (topicItems.length > 0) {
      return Promise.resolve(topicItems.shift()!);
    }

    // Register as waiting for this specific topic
    return new Promise<T>((resolve) => {
      const topicWaiters = this.waiters.get(topic) || [];
      topicWaiters.push(resolve);
      this.waiters.set(topic, topicWaiters);
    });
  }
}
