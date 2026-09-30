export type RuleKind = 'letter' | 'number' | 'punctuation' | 'contraction' | 'special';
export type LineStatus = 'unchecked' | 'reviewed' | 'questionable' | 'approved' | 'reconcile-pending';
export type IssueSeverity = 'error' | 'warning' | 'info';

export interface TranscriptionRule {
  id: string;
  source: string;
  output: string;
  kind: RuleKind;
  enabled: boolean;
  suspicious: boolean;
  description: string;
}

export interface RuleSet {
  id: string;
  name: string;
  description: string;
  contractions: boolean;
  hyphenMode: 'cross-line' | 'inline';
  rules: TranscriptionRule[];
}

export interface BrailleToken {
  id: string;
  text: string;
  braille: string;
  kind: RuleKind;
  ruleId?: string;
  suspicious: boolean;
  offset: number;
}

export interface TextbookLine {
  id: string;
  source: string;
  tokens: BrailleToken[];
  status: LineStatus;
  note: string;
  continuesPrevious: boolean;
  continuesNext: boolean;
  /** 印厂制版回执并入后的实测版面；无回执时为 undefined。 */
  layout?: LineLayout;
}

/** 送印清单中的一行：按当前行号登记，供回执按行号并入。 */
export interface PrintManifestEntry {
  lineId: string;
  lineNo: number;
  source: string;
  signature: string;
  computedCells: number;
}

export interface PrintBatch {
  id: string;
  title: string;
  sentAt: string;
  ruleSetId: string;
  manifest: PrintManifestEntry[];
}

/** 印厂回执中的一行实测数据，按行号并入后挂在对应课文行上。 */
export interface LineLayout {
  batchId: string;
  lineId: string;
  lineNo: number;
  /** 印厂实测格数。 */
  measuredCells: number;
  /** 印厂回传页码。 */
  page: number;
  /** 印厂随单回传的原文，用于识别印厂侧是否动过内容。 */
  factorySource?: string;
  /** 送印时工作台登记的内容签名，用于比对工作台是否再改过。 */
  sentSignature: string;
  /** 两边都动过时保留印厂版原文与实测转写格数，供人工挑版。 */
  factoryChanged: boolean;
  /** 两边都动过：原文/转写最终认工作台、版面认印厂，待人工挑版。 */
  conflict: boolean;
  /** 人工挑版后写入；之后分析不再把该行打回待对账。 */
  resolved?: 'workbench' | 'factory';
  measuredAt: string;
}

export interface PageSummary {
  page: number;
  lines: number;
  measuredCells: number;
}

export interface PrintSummary {
  reconciledAt: string;
  lineCount: number;
  measuredCells: number;
  pages: PageSummary[];
  conflictCount: number;
  overflowCount: number;
}

/** 整批对账失败记录；失败时上一版回执原样保留。 */
export interface ReconcileFailure {
  batchId: string;
  at: string;
  reason: string;
  receiptBatchId?: string;
}

export interface ProofIssue {
  id: string;
  lineId: string;
  tokenId?: string;
  ruleId?: string;
  severity: IssueSeverity;
  code: string;
  message: string;
  resolved: boolean;
}

export interface VersionSnapshot {
  id: string;
  name: string;
  createdAt: string;
  action: string;
  snapshot: Omit<ProjectState, 'versions'>;
}

/** 制版对账整批状态：送印清单、最近一次成功对账（上一版）与最近一次失败。 */
export interface PrintingState {
  sentBatch: PrintBatch | null;
  /** 最近一次整批对账成功后的批次与汇总，即“上一版”。 */
  lastGood: { batch: PrintBatch; summary: PrintSummary } | null;
  lastFailure: ReconcileFailure | null;
}

export interface ProjectState {
  id: string;
  title: string;
  author: string;
  activeRuleSetId: string;
  ruleSets: RuleSet[];
  lines: TextbookLine[];
  selectedLineId: string;
  issues: ProofIssue[];
  versions: VersionSnapshot[];
  printing: PrintingState;
  lastCheckedAt: string;
  updatedAt: string;
}

export interface HistoryState {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
  lastAction: string;
}
