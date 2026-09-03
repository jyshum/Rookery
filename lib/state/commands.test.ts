import { describe, it, expect } from 'vitest'
import { CommandStack, type Command } from './commands'

function logged(log: string[], name: string): Command {
  return {
    label: name,
    do: () => { log.push(`do:${name}`) },
    undo: () => { log.push(`undo:${name}`) },
  }
}

describe('CommandStack', () => {
  it('runs a command when executed', () => {
    const log: string[] = []
    const s = new CommandStack()
    s.execute(logged(log, 'a'))
    expect(log).toEqual(['do:a'])
  })

  it('undoes in reverse order', () => {
    const log: string[] = []
    const s = new CommandStack()
    s.execute(logged(log, 'a'))
    s.execute(logged(log, 'b'))
    s.undo()
    s.undo()
    expect(log).toEqual(['do:a', 'do:b', 'undo:b', 'undo:a'])
  })

  it('redoes what was undone', () => {
    const log: string[] = []
    const s = new CommandStack()
    s.execute(logged(log, 'a'))
    s.undo()
    s.redo()
    expect(log).toEqual(['do:a', 'undo:a', 'do:a'])
  })

  it('clears the redo stack when a new command is executed', () => {
    const s = new CommandStack()
    s.execute(logged([], 'a'))
    s.undo()
    expect(s.canRedo).toBe(true)
    s.execute(logged([], 'b'))
    expect(s.canRedo).toBe(false)
  })

  it('reports canUndo and canRedo correctly', () => {
    const s = new CommandStack()
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(false)
    s.execute(logged([], 'a'))
    expect(s.canUndo).toBe(true)
    expect(s.canRedo).toBe(false)
    s.undo()
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(true)
  })

  it('ignores undo and redo when the stacks are empty', () => {
    const s = new CommandStack()
    expect(() => { s.undo(); s.redo() }).not.toThrow()
  })

  it('caps history at the configured limit, dropping the oldest', () => {
    const s = new CommandStack(3)
    for (let i = 0; i < 10; i++) s.execute(logged([], `c${i}`))
    expect(s.undoLabels).toEqual(['c7', 'c8', 'c9'])
  })

  it('survives a deep undo-redo-undo cycle in order', () => {
    const log: string[] = []
    const s = new CommandStack()
    s.execute(logged(log, 'a'))
    s.execute(logged(log, 'b'))
    s.execute(logged(log, 'c'))
    s.undo()
    s.undo()
    s.redo()
    s.undo()
    expect(log).toEqual([
      'do:a', 'do:b', 'do:c',
      'undo:c', 'undo:b',
      'do:b',
      'undo:b',
    ])
  })

  it('notifies a subscriber whenever the stack changes', () => {
    const s = new CommandStack()
    let ticks = 0
    const stop = s.subscribe(() => { ticks++ })
    s.execute(logged([], 'a'))
    s.undo()
    s.redo()
    expect(ticks).toBe(3)
    stop()
    s.execute(logged([], 'b'))
    expect(ticks).toBe(3)
  })

  it('clears both stacks', () => {
    const s = new CommandStack()
    s.execute(logged([], 'a'))
    s.undo()
    s.clear()
    expect(s.canUndo).toBe(false)
    expect(s.canRedo).toBe(false)
  })
})
