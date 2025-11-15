import { agent, agentAccountId, agentCall } from "@neardefi/shade-agent-js";

interface QueueItem<T> {
  call: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  timestamp: number;
  retryCount: number;
}

interface QueueStatus {
  isProcessing: boolean;
  queueLength: number;
}

class AgentCallQueue {
  private isProcessing: boolean = false;
  private queue: QueueItem<any>[] = [];

  async enqueue<T>(call: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queueItem: QueueItem<T> = {
        call,
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0,
      };

      this.queue.push(queueItem);
      console.log(`🔄 Queued agent call. Queue length: ${this.queue.length}`);

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`🚀 Processing queue with ${this.queue.length} items`);

    while (this.queue.length > 0) {
      const queueItem = this.queue.shift();
      if (!queueItem) continue;

      const { call, resolve, reject, timestamp, retryCount } = queueItem;

      try {
        console.log(
          `⏳ Executing queued call (queued for ${
            Date.now() - timestamp
          }ms, attempt ${retryCount + 1})`
        );
        const result = await call();
        console.log(`✅ Queued call completed successfully`);
        resolve(result);
      } catch (error: any) {
        console.error(
          `❌ Queued call failed (attempt ${retryCount + 1}):`,
          error.message
        );

        // Retry logic for recoverable errors
        if (retryCount < 2 && this.shouldRetry(error)) {
          console.log(`🔄 Retrying call (attempt ${retryCount + 2}/3)`);

          // Re-queue with incremented retry count
          this.queue.unshift({
            ...queueItem,
            retryCount: retryCount + 1,
          });

          // Brief delay before retry
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
          reject(error);
        }
      }

      // Small delay between calls to prevent nonce conflicts
      if (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    this.isProcessing = false;
    console.log(`🏁 Queue processing complete`);
  }

  private shouldRetry(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || "";
    return (
      errorMessage.includes("nonce") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("network") ||
      errorMessage.includes("connection")
    );
  }

  getStatus(): QueueStatus {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
    };
  }
}

// Create singleton instance
const agentQueue = new AgentCallQueue();

// Queued wrapper functions with proper typing
export const queuedAgent = (method: string, args?: any): Promise<any> => {
  return agentQueue.enqueue(() => agent(method, args));
};

export const queuedAgentAccountId = (): Promise<{ accountId: string }> => {
  return agentQueue.enqueue(() => agentAccountId());
};

export const queuedAgentCall = (args: {
  methodName: string;
  args: any;
  contractId?: string;
  gas?: string | number;
  deposit?: string | number;
}): Promise<any> => {
  return agentQueue.enqueue(() => agentCall(args));
};

// Queue status for debugging
export const getQueueStatus = (): QueueStatus => {
  return agentQueue.getStatus();
};
