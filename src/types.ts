export type RuleKind = 'letter' | 'number' | 'punctuation' | 'contraction' | 'special';
export type LineStatus = 'unchecked' | 'reviewed' | 'questionable' | 'approved';
export type IssueSeverity = 'error' | 'warning' | 'info';
export type ReconcileStatus = 'synced' | 'pending' | 'conflict';

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
  /** 与制版回执的对账状态：已同步 / 待对账（工作台动过）/ 冲突（两边都动过）。 */
  reconcileStatus: ReconcileStatus;
  /** 送制版时工作台这一版的快照，作为比对基准。 */
  sentVersion?: LineVersion;
  /** 制版回执实测版面：实测格数与页码。 */
  plateLayout?: PlateLayout;
  /** 制版回执那版（原文转写 + 实测版面），冲突时与工作台版并存供挑选。 */
  receiptVersion?: LineVersion;
}

export interface LineVersion {
  source: string;
  braille: string;
  cells: number;
  page?: number;
  continuesPrevious: boolean;
  continuesNext: boolean;
}

export interface PlateLayout {
  cells: number;
  page: number;
}

export interface PlateReceiptLine {
  lineNo: number;
  cells: number;
  page: number;
}

export interface PlateReceipt {
  id: string;
  receivedAt: string;
  lines: PlateReceiptLine[];
}

export interface ReconcileReport {
  receivedAt: string;
  matched: number;
  synced: number;
  pending: number;
  conflicts: number;
  /** 回执里有、但工作台对不上行号的行（行号漂移），不并入、不重复建行。 */
  receiptOnly: number;
  /** 实测总格数（无实测值的行取工作台计算值）。 */
  totalCells: number;
  totalPages: number;
  /** 工作台按规则算出的总格数。 */
  computedCells: number;
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
  lastCheckedAt: string;
  updatedAt: string;
  /** 最近一次送制版时间。 */
  lastSentAt?: string;
  /** 最近一次并入的制版回执。 */
  plateReceipt?: PlateReceipt;
  /** 最近一次对账汇总。 */
  reconcileReport?: ReconcileReport;
}

export interface HistoryState {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
  lastAction: string;
}
