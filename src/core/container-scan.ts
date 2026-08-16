import type { StateBlock } from 'markdown-it';

const COLON = 0x3a;

export interface ContainerScan {
  markers: number;
  info: string;
  name: string;
  rest: string;
  contentEnd: number;
  closed: boolean;
}

export function countMarkers(state: StateBlock, line: number): number {
  const start = state.bMarks[line] + state.tShift[line];
  const max = state.eMarks[line];
  let pos = start;
  while (pos < max && state.src.charCodeAt(pos) === COLON) {
    pos += 1;
  }
  return pos - start;
}

export function containerInfo(state: StateBlock, line: number, markers: number): string {
  const start = state.bMarks[line] + state.tShift[line] + markers;
  return state.src.slice(start, state.eMarks[line]).trim();
}

/**
 * Locates the extent of a `:::name ... :::` container starting at `startLine`, or
 * returns null when the line does not open one.
 *
 * Shared by the browser renderer and the VS Code extension so the two cannot drift.
 */
export function scanContainer(state: StateBlock, startLine: number, endLine: number): ContainerScan | null {
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return null;
  }
  const markers = countMarkers(state, startLine);
  if (markers < 3) {
    return null;
  }
  const info = containerInfo(state, startLine, markers);
  if (info === '' ||
      info.includes(':::')) {
    return null;
  }

  // Track a stack of opener marker lengths. A single depth counter plus the outer
  // marker length gets the conventional `::::outer` / `:::inner` nesting wrong: the
  // shorter inner closer is skipped and the outer closer ends the inner block.
  const openMarkers = [markers];
  let line = startLine;
  let closed = false;
  while (line + 1 < endLine) {
    line += 1;
    if (state.sCount[line] - state.blkIndent >= 4) {
      continue;
    }
    const lineMarkers = countMarkers(state, line);
    if (lineMarkers < 3) {
      continue;
    }
    if (containerInfo(state, line, lineMarkers) === '') {
      if (lineMarkers < openMarkers[openMarkers.length - 1]) {
        continue;
      }
      openMarkers.pop();
      if (openMarkers.length === 0) {
        closed = true;
        break;
      }
    } else {
      openMarkers.push(lineMarkers);
    }
  }

  const name = info.split(/\s+/)[0].toLowerCase();
  return {
    markers,
    info,
    name,
    rest: info.slice(name.length).trim(),
    contentEnd: closed ? line : endLine,
    closed,
  };
}
