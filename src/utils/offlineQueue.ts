// Queue for storing actions to be executed when back online

interface QueuedAction {
  id: string;
  type: 'message' | 'status_update';
  payload: any;
  timestamp: number;
}

const QUEUE_KEY = 'voicelink_offline_queue';

export const offlineQueue = {
  getQueue(): QueuedAction[] {
    try {
      const queue = localStorage.getItem(QUEUE_KEY);
      return queue ? JSON.parse(queue) : [];
    } catch {
      return [];
    }
  },

  addToQueue(action: Omit<QueuedAction, 'id' | 'timestamp'>): void {
    const queue = this.getQueue();
    queue.push({
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  removeFromQueue(id: string): void {
    const queue = this.getQueue().filter(action => action.id !== id);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  clearQueue(): void {
    localStorage.removeItem(QUEUE_KEY);
  },

  hasItems(): boolean {
    return this.getQueue().length > 0;
  }
};
