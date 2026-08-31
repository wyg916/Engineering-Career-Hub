import { isAbsolute, relative } from 'node:path'

export function isPathStrictlyInside(root: string, candidate: string): boolean {
  const child = relative(root, candidate)
  return child !== '' && !child.startsWith('..') && !isAbsolute(child)
}
