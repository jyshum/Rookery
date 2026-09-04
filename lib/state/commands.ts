/**
 * Undo and redo.
 *
 * Each edit is an object that knows how to apply and reverse itself, rather than
 * a copy of the state before it. Copying works for boxes and polygons but not for
 * masks, where one 4K bitmap is around 33 MB.
 *
 * So a move stores its delta, an attribute change stores the old and new value,
 * and a brush stroke stores the cursor path. All of them are kilobytes.
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
