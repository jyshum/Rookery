/**
 * Undo and redo via a command stack.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT SNAPSHOT THE WHOLE STORE
 * ---------------------------------------------------------------------------
 * The common approach is to deep-copy application state after every edit and
 * swap an old copy back on undo. It is simple and it works right up until the
 * state contains something large.
 *
 * Here it does. A painted mask on a 4K image is ~33 MB of raw pixels. Copying
 * that per brush stroke exhausts memory in seconds.
 *
 * So each edit is stored as an object that knows how to apply itself and how to
 * invert itself. Adding a shape stores the shape. Moving a vertex stores the
 * delta. Changing an attribute stores the previous and next value. A brush
 * stroke stores the cursor path, and its inverse is handled by MaskBuffer,
 * which replays from its nearest snapshot.
 *
 * Every one of those is kilobytes, and every one is undoable the same way.
 *
 * See spec section 6.3.
 */

export interface Command {
  /** Human-readable, shown in tooltips and useful when debugging the stack. */
  label: string
  do(): void
  undo(): void
}

export class CommandStack {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private listeners = new Set<() => void>()

  /**
   * @param limit Maximum retained undo steps. Bounds memory over a long
   *   session; the oldest command is dropped once the limit is reached.
   */
  constructor(private readonly limit = 200) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoLabels(): string[] {
    return this.undoStack.map((c) => c.label)
  }

  /**
   * Run a command and push it onto the undo stack.
   *
   * Executing anything new invalidates the redo stack. Once you branch away
   * from a history, the abandoned future is no longer reachable.
   */
  execute(c: Command): void {
    c.do()
    this.undoStack.push(c)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack.length = 0
    this.emit()
  }

  undo(): void {
    const c = this.undoStack.pop()
    if (!c) return
    c.undo()
    this.redoStack.push(c)
    this.emit()
  }

  redo(): void {
    const c = this.redoStack.pop()
    if (!c) return
    c.do()
    this.undoStack.push(c)
    this.emit()
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.emit()
  }

  /**
   * Subscribe to stack changes so the toolbar can enable and disable its undo
   * and redo buttons. The stack lives outside React, so it publishes changes
   * rather than being re-read on every render.
   */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}
