export class PendingTaskTracker {
  private readonly tasks = new Set<Promise<void>>();

  track(task: Promise<void>) {
    this.tasks.add(task);
    void task.then(
      () => this.tasks.delete(task),
      () => this.tasks.delete(task),
    );
  }

  async waitForIdle() {
    while (this.tasks.size > 0) {
      await Promise.allSettled([...this.tasks]);
    }
  }
}
