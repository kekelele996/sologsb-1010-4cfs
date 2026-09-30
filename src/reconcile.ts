import { analyzeProject } from './braille';
import type {
  LineVersion,
  PlateReceipt,
  PlateReceiptLine,
  ProjectState,
  ReconcileReport,
  TextbookLine,
} from './types';

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 工作台按规则算出的盲文格数（空格不计格）。 */
export function computedCells(line: TextbookLine): number {
  return line.tokens.reduce((total, token) => total + token.braille.replace(/\s/g, '').length, 0);
}

export function brailleText(line: TextbookLine): string {
  return line.tokens.map((token) => token.braille).join('');
}

/** 抓取某一行当前的工作台版本快照。 */
export function snapshotVersion(line: TextbookLine): LineVersion {
  return {
    source: line.source,
    braille: brailleText(line),
    cells: computedCells(line),
    continuesPrevious: line.continuesPrevious,
    continuesNext: line.continuesNext,
  };
}

/**
 * 解析印厂回传的制版回执。
 * 每行只要含三个整数即识别为「行号 实测格数 页码」，容忍前后缀文字。
 */
export function parseReceipt(text: string): PlateReceiptLine[] {
  const rows: PlateReceiptLine[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const nums = raw.match(/\d+/g);
    if (!nums || nums.length < 3) continue;
    const [lineNo, cells, page] = nums.map(Number);
    if (!Number.isFinite(lineNo) || !Number.isFinite(cells) || !Number.isFinite(page)) continue;
    if (lineNo < 1 || cells < 0 || page < 1) continue;
    rows.push({ lineNo, cells, page });
  }
  rows.sort((a, b) => a.lineNo - b.lineNo);
  return rows;
}

/** 工作台是否动过这一行的原文或转写（相对送制版快照）。 */
function workbenchMoved(line: TextbookLine): boolean {
  if (!line.sentVersion) return false;
  return line.source !== line.sentVersion.source || brailleText(line) !== line.sentVersion.braille;
}

/**
 * 工作台改动原文或规则后，把受影响的课文行标为待对账。
 * 应在每次工作台变更（改原文、改规则、导入、拆行、增删行）之后调用。
 */
export function markWorkbenchChanges(state: ProjectState): ProjectState {
  const lines = state.lines.map((line) => {
    if (!line.sentVersion) return line;
    if (workbenchMoved(line) && line.reconcileStatus !== 'pending') {
      return { ...line, reconcileStatus: 'pending' as const };
    }
    return line;
  });
  const next: ProjectState = { ...state, lines };
  if (state.plateReceipt) next.reconcileReport = refreshReport(next);
  return next;
}

/** 送印厂制版：把当前原文与转写快照作为比对基准，清空旧回执。 */
export function sendToPlate(state: ProjectState, now = new Date().toISOString()): ProjectState {
  const lines = state.lines.map((line) => ({
    ...line,
    reconcileStatus: 'synced' as const,
    sentVersion: snapshotVersion(line),
    plateLayout: undefined,
    receiptVersion: undefined,
  }));
  return { ...state, lines, lastSentAt: now, plateReceipt: undefined, reconcileReport: undefined, updatedAt: now };
}

export interface ReconcileOutcome {
  ok: boolean;
  error?: string;
  state?: ProjectState;
  report?: ReconcileReport;
}

/**
 * 整批并入制版回执（事务性）：先校验，失败则原样返回、不动状态；
 * 成功才按行号把实测格数与页码并入，并保留两版供挑选。
 */
export function reconcileReceipt(prev: ProjectState, receiptText: string, now = new Date().toISOString()): ReconcileOutcome {
  const parsed = parseReceipt(receiptText);
  if (parsed.length === 0) {
    return { ok: false, error: '回执里没有可识别的行：每行需要“行号 实测格数 页码”三个数，例如 1 24 3。整批未并入，已保住上一版。' };
  }
  const lineNos = parsed.map((row) => row.lineNo);
  if (new Set(lineNos).size !== lineNos.length) {
    return { ok: false, error: '回执行号有重复，整批未并入（不会追加重复行）。请让印厂核对后重试。' };
  }

  const receiptByNo = new Map<number, PlateReceiptLine>(parsed.map((row) => [row.lineNo, row]));
  const receipt: PlateReceipt = { id: uid('receipt'), receivedAt: now, lines: parsed };

  const next: ProjectState = structuredClone(prev);
  next.plateReceipt = receipt;

  let matched = 0;
  let synced = 0;
  let pending = 0;
  let conflicts = 0;

  next.lines.forEach((line, index) => {
    const lineNo = index + 1;
    const row = receiptByNo.get(lineNo);
    const baseline = line.sentVersion;
    const moved = workbenchMoved(line);

    if (!row) {
      // 回执里没有这一行：工作台动过则待对账，否则沿用原状态。
      line.reconcileStatus = moved ? 'pending' : (line.reconcileStatus === 'conflict' ? 'conflict' : 'synced');
      if (line.reconcileStatus === 'pending') pending += 1;
      else if (line.reconcileStatus === 'conflict') conflicts += 1;
      else synced += 1;
      return;
    }

    matched += 1;
    const printerChanged = baseline ? row.cells !== baseline.cells : row.cells !== computedCells(line);

    if (moved && baseline && printerChanged) {
      // 两边都动过：原文与转写认工作台，实测版面认回执，两版都留下。
      line.reconcileStatus = 'conflict';
      line.plateLayout = { cells: row.cells, page: row.page };
      line.receiptVersion = {
        source: baseline.source,
        braille: baseline.braille,
        cells: row.cells,
        page: row.page,
        continuesPrevious: baseline.continuesPrevious,
        continuesNext: baseline.continuesNext,
      };
      conflicts += 1;
      return;
    }

    if (moved) {
      // 只有工作台动过：回执数据相对旧原文已过期，先待对账。
      line.reconcileStatus = 'pending';
      line.plateLayout = { cells: row.cells, page: row.page };
      pending += 1;
      return;
    }

    // 工作台没动过：并入实测版面；若印厂调过格数则留一版回执版。
    line.reconcileStatus = 'synced';
    line.plateLayout = { cells: row.cells, page: row.page };
    if (printerChanged) {
      line.receiptVersion = {
        source: line.source,
        braille: brailleText(line),
        cells: row.cells,
        page: row.page,
        continuesPrevious: line.continuesPrevious,
        continuesNext: line.continuesNext,
      };
    } else {
      line.receiptVersion = undefined;
    }
    synced += 1;
  });

  const reanalyzed = analyzeProject(next);
  const report = refreshReport(reanalyzed);
  reanalyzed.reconcileReport = report;
  reanalyzed.updatedAt = now;

  return { ok: true, state: reanalyzed, report };
}

/** 按当前 lines 与 plateReceipt 重算对账汇总（断词/汇总量跟着重算）。 */
export function refreshReport(state: ProjectState): ReconcileReport {
  const parsed = state.plateReceipt?.lines ?? [];
  const synced = state.lines.filter((line) => line.reconcileStatus === 'synced').length;
  const pending = state.lines.filter((line) => line.reconcileStatus === 'pending').length;
  const conflicts = state.lines.filter((line) => line.reconcileStatus === 'conflict').length;
  const receiptOnly = parsed.filter((row) => row.lineNo > state.lines.length).length;
  const computedTotal = state.lines.reduce((total, line) => total + computedCells(line), 0);
  const measuredTotal = state.lines.reduce((total, line) => total + (line.plateLayout?.cells ?? computedCells(line)), 0);
  const totalPages = parsed.length ? Math.max(...parsed.map((row) => row.page)) : 0;
  return {
    receivedAt: state.plateReceipt?.receivedAt ?? '',
    matched: state.lines.filter((line) => line.plateLayout).length,
    synced,
    pending,
    conflicts,
    receiptOnly,
    totalCells: measuredTotal,
    totalPages,
    computedCells: computedTotal,
  };
}

/** 冲突行挑版：工作台版（保留计算格数）或回执实测版面。 */
export function chooseConflictVersion(state: ProjectState, lineId: string, choice: 'workbench' | 'receipt'): ProjectState {
  const lines = state.lines.map((line) => {
    if (line.id !== lineId || line.reconcileStatus !== 'conflict') return line;
    if (choice === 'workbench') {
      return { ...line, reconcileStatus: 'synced' as const, plateLayout: undefined, receiptVersion: undefined };
    }
    const layout = line.receiptVersion
      ? { cells: line.receiptVersion.cells, page: line.receiptVersion.page ?? line.plateLayout?.page ?? 0 }
      : line.plateLayout;
    return { ...line, reconcileStatus: 'synced' as const, plateLayout: layout, receiptVersion: undefined };
  });
  const next: ProjectState = { ...state, lines, updatedAt: new Date().toISOString() };
  next.reconcileReport = refreshReport(next);
  return next;
}
