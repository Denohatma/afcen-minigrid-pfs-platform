"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { EvalStage, EvalCriterion, EvalBidResult, Lot, Bid, Bidder } from "@/lib/types";

const STAGE_LABELS = ["Admin Check", "Technical", "Financial", "Combined & Award"];
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-800",
  consensus: "bg-amber-100 text-amber-800",
  locked: "bg-green-100 text-green-800",
  skipped: "bg-gray-100 text-gray-500",
};

function formatLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(n: number | null | undefined) {
  return n != null ? n.toFixed(1) : "—";
}

const DEFAULT_CRITERIA = [
  { stage: 2, code: "T1", name: "Organizational Capacity & Experience", weight: 10 },
  { stage: 2, code: "T2", name: "Team Qualifications & Key Personnel", weight: 10 },
  { stage: 2, code: "T3", name: "Technical Design — PV & BESS Sizing", weight: 15 },
  { stage: 2, code: "T4", name: "Technical Design — Distribution Network", weight: 10 },
  { stage: 2, code: "T5", name: "Construction Methodology & Timeline", weight: 10 },
  { stage: 2, code: "T6", name: "Operations & Maintenance Plan", weight: 15 },
  { stage: 2, code: "T7", name: "Community Engagement & GESI", weight: 10 },
  { stage: 2, code: "T8", name: "Environmental & Social Safeguards", weight: 10 },
  { stage: 2, code: "T9", name: "Tariff Plan & Revenue Model", weight: 10 },
  { stage: 3, code: "F1", name: "Grant Ask as % of Eligible CAPEX", weight: 40 },
  { stage: 3, code: "F2", name: "Proposed Residential Tariff", weight: 25 },
  { stage: 3, code: "F3", name: "Financial Model Quality & DSCR", weight: 20 },
  { stage: 3, code: "F4", name: "Risk Allocation & Guarantees", weight: 15 },
];

export default function EvaluationsPage() {
  const { role } = useRole();
  const qc = useQueryClient();
  const isPMU = role.backendRole === "rea_pmu_officer";
  const isEvaluator = role.backendRole === "afcen_analyst";

  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);

  const { data: lotsData, isLoading: lotsLoading } = useQuery({
    queryKey: ["lots"],
    queryFn: () => api.lots.list(),
  });

  const { data: biddersData } = useQuery({
    queryKey: ["bidders"],
    queryFn: () => api.bidders.list(),
  });

  const lots = lotsData?.lots ?? [];
  const bidders = biddersData?.bidders ?? [];
  const lotsWithTender = lots.filter(
    (l) => l.tender_status && l.tender_status !== "none" && l.tender_status !== "draft"
  );

  if (lotsLoading) {
    return <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>;
  }

  if (lotsWithTender.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        No lots with active tenders. <Link href="/lots" className="text-primary underline">Issue tenders</Link> first.
      </div>
    );
  }

  const activeLot = selectedLotId ? lots.find((l) => l.id === selectedLotId) : null;

  return (
    <div className="text-[13px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-base font-bold">Bid Evaluation</h1>
          <p className="text-[11px] text-muted-foreground">
            {lotsWithTender.length} lots with tenders &middot; 4-stage evaluation pipeline
          </p>
        </div>
      </div>

      {/* Lot selector cards */}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {lotsWithTender.map((lot) => (
          <button
            key={lot.id}
            onClick={() => setSelectedLotId(lot.id)}
            className={`text-left rounded border p-3 transition-colors ${
              selectedLotId === lot.id
                ? "border-primary bg-primary/5"
                : "border-border bg-white hover:border-primary/40"
            }`}
          >
            <div className="font-medium text-[12px]">{lot.lot_name}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {lot.disco} &middot; {lot.site_count} sites &middot; {lot.total_connections.toLocaleString()} connections
            </div>
            <div className="text-[10px] mt-1">
              <span className={`inline-block rounded px-1.5 py-px font-medium ${STATUS_COLORS[lot.tender_status] || "bg-gray-100 text-gray-700"}`}>
                {formatLabel(lot.tender_status || "draft")}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Detail view when a lot is selected */}
      {activeLot && (
        <EvalPipeline
          lot={activeLot}
          bidders={bidders}
          isPMU={isPMU}
          isEvaluator={isEvaluator}
        />
      )}
    </div>
  );
}

function EvalPipeline({
  lot,
  bidders,
  isPMU,
  isEvaluator,
}: {
  lot: Lot;
  bidders: Bidder[];
  isPMU: boolean;
  isEvaluator: boolean;
}) {
  const qc = useQueryClient();
  const [scoreForm, setScoreForm] = useState<{
    criterionId: string;
    bidId: string;
    score: string;
    justification: string;
  } | null>(null);

  const { data: stagesData, isLoading: stagesLoading } = useQuery({
    queryKey: ["eval-stages", lot.id],
    queryFn: () => api.evalStages.list(lot.id),
  });

  const { data: resultsData } = useQuery({
    queryKey: ["eval-results", lot.id],
    queryFn: () => api.evalStages.results(lot.id),
  });

  const { data: bidsData } = useQuery({
    queryKey: ["bids-for-lot", lot.id],
    queryFn: async () => {
      if (!lot.tender) return { bids: [] };
      return api.bids.listForTender(lot.tender.id);
    },
    enabled: !!lot.tender,
  });

  const stages = stagesData?.stages ?? [];
  const results = resultsData?.results ?? [];
  const bids = bidsData?.bids ?? [];
  const hasStages = stages.length > 0;

  const setupMut = useMutation({
    mutationFn: () =>
      api.evalStages.setup(lot.id, {
        stage2_threshold: 70,
        stage3_threshold: 0,
        stage4_technical_weight: 60,
        stage4_financial_weight: 40,
        criteria: DEFAULT_CRITERIA,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-stages", lot.id] });
    },
  });

  const stage1Mut = useMutation({
    mutationFn: () => api.evalStages.runStage1(lot.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-stages", lot.id] });
      qc.invalidateQueries({ queryKey: ["eval-results", lot.id] });
    },
  });

  const lockStage2Mut = useMutation({
    mutationFn: () => api.evalStages.lockStage2(lot.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-stages", lot.id] });
      qc.invalidateQueries({ queryKey: ["eval-results", lot.id] });
    },
  });

  const lockStage3Mut = useMutation({
    mutationFn: () => api.evalStages.lockStage3(lot.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-stages", lot.id] });
      qc.invalidateQueries({ queryKey: ["eval-results", lot.id] });
    },
  });

  const calcStage4Mut = useMutation({
    mutationFn: () => api.evalStages.calculateStage4(lot.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-stages", lot.id] });
      qc.invalidateQueries({ queryKey: ["eval-results", lot.id] });
    },
  });

  const scoreMut = useMutation({
    mutationFn: (d: { stageNum: number; criterion_id: string; bid_id: string; score: number; justification: string }) =>
      api.evalStages.score(lot.id, d.stageNum, {
        criterion_id: d.criterion_id,
        bid_id: d.bid_id,
        score: d.score,
        justification: d.justification,
      }),
    onSuccess: () => {
      setScoreForm(null);
      qc.invalidateQueries({ queryKey: ["eval-results", lot.id] });
    },
  });

  const recommendMut = useMutation({
    mutationFn: (bidId: string) =>
      api.evalStages.recommend(lot.id, { bid_id: bidId, note: "Recommended for award based on combined evaluation score" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-results", lot.id] });
    },
  });

  const bidderName = useCallback(
    (developerId: string) => {
      const bidder = bidders.find((b) => b.id === developerId);
      return bidder?.company_name ?? developerId.slice(0, 8);
    },
    [bidders]
  );

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded border border-border bg-white p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">{lot.lot_name} — Evaluation Pipeline</h2>
          {!hasStages && isPMU && (
            <Button
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setupMut.mutate()}
              disabled={setupMut.isPending}
            >
              {setupMut.isPending ? "Setting up..." : "Initialize Evaluation Stages"}
            </Button>
          )}
        </div>

        {stagesLoading ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Loading stages...</div>
        ) : !hasStages ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No evaluation stages configured. {isPMU ? "Click above to initialize." : "PMU must initialize evaluation stages."}
          </div>
        ) : (
          <>
            {/* Stage stepper */}
            <div className="mt-3 flex items-center gap-0">
              {stages.map((stage, idx) => {
                const isCompleted = stage.status === "locked";
                const isActive = stage.status === "active";
                return (
                  <div key={stage.id} className="flex items-center">
                    {idx > 0 && (
                      <div className={`h-0.5 w-8 ${isCompleted || isActive ? "bg-primary" : "bg-gray-200"}`} />
                    )}
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ${
                          isCompleted
                            ? "bg-green-600 text-white"
                            : isActive
                            ? "bg-primary text-white"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {isCompleted ? "✓" : stage.stage_number}
                      </div>
                      <span className={`mt-1 text-[9px] font-medium text-center max-w-[80px] ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                        {STAGE_LABELS[idx] || stage.stage_name}
                      </span>
                      <span className={`text-[8px] rounded px-1 mt-0.5 ${STATUS_COLORS[stage.status] || ""}`}>
                        {formatLabel(stage.status)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stage actions */}
            <div className="mt-3 space-y-2">
              {stages.map((stage) => (
                <StagePanel
                  key={stage.id}
                  stage={stage}
                  lot={lot}
                  bids={bids}
                  results={results}
                  bidderName={bidderName}
                  isPMU={isPMU}
                  isEvaluator={isEvaluator}
                  scoreForm={scoreForm}
                  setScoreForm={setScoreForm}
                  onRunStage1={() => stage1Mut.mutate()}
                  stage1Pending={stage1Mut.isPending}
                  onLockStage2={() => lockStage2Mut.mutate()}
                  lock2Pending={lockStage2Mut.isPending}
                  onLockStage3={() => lockStage3Mut.mutate()}
                  lock3Pending={lockStage3Mut.isPending}
                  onCalcStage4={() => calcStage4Mut.mutate()}
                  calc4Pending={calcStage4Mut.isPending}
                  onSubmitScore={(d) => scoreMut.mutate(d)}
                  scorePending={scoreMut.isPending}
                  onRecommend={(bidId) => recommendMut.mutate(bidId)}
                  recommendPending={recommendMut.isPending}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StagePanel({
  stage,
  lot,
  bids,
  results,
  bidderName,
  isPMU,
  isEvaluator,
  scoreForm,
  setScoreForm,
  onRunStage1,
  stage1Pending,
  onLockStage2,
  lock2Pending,
  onLockStage3,
  lock3Pending,
  onCalcStage4,
  calc4Pending,
  onSubmitScore,
  scorePending,
  onRecommend,
  recommendPending,
}: {
  stage: EvalStage;
  lot: Lot;
  bids: Bid[];
  results: Array<{ bid_id: string; developer_id: string; stages: Record<string, EvalBidResult> }>;
  bidderName: (id: string) => string;
  isPMU: boolean;
  isEvaluator: boolean;
  scoreForm: { criterionId: string; bidId: string; score: string; justification: string } | null;
  setScoreForm: (f: { criterionId: string; bidId: string; score: string; justification: string } | null) => void;
  onRunStage1: () => void;
  stage1Pending: boolean;
  onLockStage2: () => void;
  lock2Pending: boolean;
  onLockStage3: () => void;
  lock3Pending: boolean;
  onCalcStage4: () => void;
  calc4Pending: boolean;
  onSubmitScore: (d: { stageNum: number; criterion_id: string; bid_id: string; score: number; justification: string }) => void;
  scorePending: boolean;
  onRecommend: (bidId: string) => void;
  recommendPending: boolean;
}) {
  const [expanded, setExpanded] = useState(stage.status === "active");
  const criteria = stage.criteria ?? [];
  const stageKey = `stage${stage.stage_number}`;

  return (
    <div className="rounded border border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
            stage.status === "locked" ? "bg-green-600 text-white" : stage.status === "active" ? "bg-primary text-white" : "bg-gray-200 text-gray-600"
          }`}>
            {stage.status === "locked" ? "✓" : stage.stage_number}
          </span>
          <span className="text-[12px] font-medium">Stage {stage.stage_number}: {stage.stage_name}</span>
          <span className={`text-[9px] rounded px-1.5 py-px ${STATUS_COLORS[stage.status] || "bg-gray-100"}`}>
            {formatLabel(stage.status)}
          </span>
        </div>
        <span className="text-muted-foreground text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {/* Stage 1: Admin Check */}
          {stage.stage_number === 1 && (
            <Stage1Content
              stage={stage}
              results={results}
              bidderName={bidderName}
              isPMU={isPMU}
              onRun={onRunStage1}
              pending={stage1Pending}
              bids={bids}
            />
          )}

          {/* Stage 2: Technical */}
          {stage.stage_number === 2 && (
            <ScoringStageContent
              stage={stage}
              stageNum={2}
              criteria={criteria}
              results={results}
              bids={bids}
              bidderName={bidderName}
              isPMU={isPMU}
              isEvaluator={isEvaluator}
              scoreForm={scoreForm}
              setScoreForm={setScoreForm}
              onSubmitScore={onSubmitScore}
              scorePending={scorePending}
              onLock={onLockStage2}
              lockPending={lock2Pending}
              scoreLabel="Technical Score"
              scoreKey="stage2_technical_score"
              passedKey="stage2_passed_threshold"
              thresholdLabel={`Threshold: ${stage.min_threshold_pct ?? 70}%`}
            />
          )}

          {/* Stage 3: Financial */}
          {stage.stage_number === 3 && (
            <ScoringStageContent
              stage={stage}
              stageNum={3}
              criteria={criteria}
              results={results}
              bids={bids}
              bidderName={bidderName}
              isPMU={isPMU}
              isEvaluator={isEvaluator}
              scoreForm={scoreForm}
              setScoreForm={setScoreForm}
              onSubmitScore={onSubmitScore}
              scorePending={scorePending}
              onLock={onLockStage3}
              lockPending={lock3Pending}
              scoreLabel="Financial Score"
              scoreKey="stage3_financial_score"
              passedKey="stage3_passed_threshold"
              thresholdLabel={stage.min_threshold_pct ? `Threshold: ${stage.min_threshold_pct}%` : "No threshold"}
            />
          )}

          {/* Stage 4: Combined & Award */}
          {stage.stage_number === 4 && (
            <Stage4Content
              stage={stage}
              results={results}
              bidderName={bidderName}
              isPMU={isPMU}
              onCalc={onCalcStage4}
              calcPending={calc4Pending}
              onRecommend={onRecommend}
              recommendPending={recommendPending}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Stage1Content({
  stage,
  results,
  bidderName,
  isPMU,
  onRun,
  pending,
  bids,
}: {
  stage: EvalStage;
  results: Array<{ bid_id: string; developer_id: string; stages: Record<string, EvalBidResult> }>;
  bidderName: (id: string) => string;
  isPMU: boolean;
  onRun: () => void;
  pending: boolean;
  bids: Bid[];
}) {
  const s1Results = results.filter((r) => r.stages.stage1);

  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-2">
        Automated check: verifies both technical and financial envelopes were submitted.
      </p>

      {stage.status === "pending" && isPMU && (
        <Button
          size="sm"
          className="h-6 text-[10px]"
          onClick={onRun}
          disabled={pending || bids.length === 0}
        >
          {pending ? "Running..." : `Run Admin Check (${bids.length} bids)`}
        </Button>
      )}

      {s1Results.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="text-[10px]">
              <TableHead className="py-1">Bidder</TableHead>
              <TableHead className="py-1 text-center">Admin Pass</TableHead>
              <TableHead className="py-1">Fail Reasons</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s1Results.map((r) => {
              const s1 = r.stages.stage1;
              return (
                <TableRow key={r.bid_id} className="text-[11px]">
                  <TableCell className="py-1">{bidderName(r.developer_id)}</TableCell>
                  <TableCell className="py-1 text-center">
                    {s1.stage1_admin_pass ? (
                      <span className="text-green-600 font-bold">PASS</span>
                    ) : (
                      <span className="text-red-600 font-bold">FAIL</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1 text-[10px] text-muted-foreground">
                    {s1.stage1_fail_reasons?.join(", ") || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {stage.status === "locked" && s1Results.length === 0 && (
        <p className="text-[11px] text-green-600">Admin check completed. All bids passed.</p>
      )}
    </div>
  );
}

function ScoringStageContent({
  stage,
  stageNum,
  criteria,
  results,
  bids,
  bidderName,
  isPMU,
  isEvaluator,
  scoreForm,
  setScoreForm,
  onSubmitScore,
  scorePending,
  onLock,
  lockPending,
  scoreLabel,
  scoreKey,
  passedKey,
  thresholdLabel,
}: {
  stage: EvalStage;
  stageNum: number;
  criteria: EvalCriterion[];
  results: Array<{ bid_id: string; developer_id: string; stages: Record<string, EvalBidResult> }>;
  bids: Bid[];
  bidderName: (id: string) => string;
  isPMU: boolean;
  isEvaluator: boolean;
  scoreForm: { criterionId: string; bidId: string; score: string; justification: string } | null;
  setScoreForm: (f: { criterionId: string; bidId: string; score: string; justification: string } | null) => void;
  onSubmitScore: (d: { stageNum: number; criterion_id: string; bid_id: string; score: number; justification: string }) => void;
  scorePending: boolean;
  onLock: () => void;
  lockPending: boolean;
  scoreLabel: string;
  scoreKey: string;
  passedKey: string;
  thresholdLabel: string;
}) {
  const stageKey = `stage${stageNum}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-muted-foreground">
          {criteria.length} criteria &middot; {thresholdLabel}
        </p>
        {stage.status === "active" && isPMU && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px]"
            onClick={onLock}
            disabled={lockPending}
          >
            {lockPending ? "Locking..." : `Lock Stage ${stageNum} & Calculate Scores`}
          </Button>
        )}
      </div>

      {/* Criteria table */}
      {criteria.length > 0 && (stage.status === "active" || stage.status === "locked") && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold text-muted-foreground mb-1">Evaluation Criteria</div>
          <Table>
            <TableHeader>
              <TableRow className="text-[9px]">
                <TableHead className="py-1">Code</TableHead>
                <TableHead className="py-1">Criterion</TableHead>
                <TableHead className="py-1 text-center">Weight</TableHead>
                <TableHead className="py-1 text-center">Max Score</TableHead>
                {stage.status === "active" && (isEvaluator || isPMU) && (
                  <TableHead className="py-1 text-center">Score Bids</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {criteria.map((c) => (
                <TableRow key={c.id} className="text-[11px]">
                  <TableCell className="py-1 font-mono text-[10px]">{c.criterion_code}</TableCell>
                  <TableCell className="py-1">{c.criterion_name}</TableCell>
                  <TableCell className="py-1 text-center">{c.weight_pct}%</TableCell>
                  <TableCell className="py-1 text-center">{c.max_score}</TableCell>
                  {stage.status === "active" && (isEvaluator || isPMU) && (
                    <TableCell className="py-1 text-center">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {bids.map((bid, i) => (
                          <Button
                            key={bid.id}
                            size="sm"
                            variant="outline"
                            className="h-5 px-1.5 text-[9px]"
                            onClick={() =>
                              setScoreForm({
                                criterionId: c.id,
                                bidId: bid.id,
                                score: "",
                                justification: "",
                              })
                            }
                          >
                            Bidder {String.fromCharCode(65 + i)}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Score form modal */}
      {scoreForm && stage.status === "active" && (
        <div className="rounded border border-primary/30 bg-primary/5 p-3 mb-2">
          <div className="text-[11px] font-semibold mb-2">
            Score: {criteria.find((c) => c.id === scoreForm.criterionId)?.criterion_name}
            {" — "}Bidder {String.fromCharCode(65 + bids.findIndex((b) => b.id === scoreForm.bidId))}
          </div>
          <div className="grid grid-cols-[1fr_3fr] gap-2 text-[11px]">
            <label className="self-center">Score (0-{criteria.find((c) => c.id === scoreForm.criterionId)?.max_score ?? 10})</label>
            <input
              type="number"
              min="0"
              max={criteria.find((c) => c.id === scoreForm.criterionId)?.max_score ?? 10}
              step="0.5"
              className="rounded border px-2 py-1 text-[11px]"
              value={scoreForm.score}
              onChange={(e) => setScoreForm({ ...scoreForm, score: e.target.value })}
            />
            <label className="self-start mt-1">Justification (min 80 chars)</label>
            <textarea
              className="rounded border px-2 py-1 text-[11px]"
              rows={3}
              value={scoreForm.justification}
              onChange={(e) => setScoreForm({ ...scoreForm, justification: e.target.value })}
              placeholder="Provide detailed justification for your score..."
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              className="h-6 text-[10px]"
              disabled={
                scorePending ||
                !scoreForm.score ||
                scoreForm.justification.length < 80
              }
              onClick={() =>
                onSubmitScore({
                  stageNum,
                  criterion_id: scoreForm.criterionId,
                  bid_id: scoreForm.bidId,
                  score: parseFloat(scoreForm.score),
                  justification: scoreForm.justification,
                })
              }
            >
              {scorePending ? "Submitting..." : "Submit Score"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px]"
              onClick={() => setScoreForm(null)}
            >
              Cancel
            </Button>
            <span className="text-[9px] text-muted-foreground self-center">
              {scoreForm.justification.length}/80 chars
            </span>
          </div>
        </div>
      )}

      {/* Results table when locked */}
      {stage.status === "locked" && (
        <div>
          <div className="text-[10px] font-semibold text-muted-foreground mb-1">{scoreLabel} Results</div>
          <Table>
            <TableHeader>
              <TableRow className="text-[9px]">
                <TableHead className="py-1">Bidder</TableHead>
                <TableHead className="py-1 text-center">{scoreLabel}</TableHead>
                <TableHead className="py-1 text-center">Passed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results
                .filter((r) => r.stages[stageKey])
                .map((r) => {
                  const sr = r.stages[stageKey];
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const score = (sr as any)[scoreKey] as number | null;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const passed = (sr as any)[passedKey] as boolean | null;
                  return (
                    <TableRow key={r.bid_id} className="text-[11px]">
                      <TableCell className="py-1">{bidderName(r.developer_id)}</TableCell>
                      <TableCell className="py-1 text-center font-mono font-semibold">
                        {fmt(score)}%
                      </TableCell>
                      <TableCell className="py-1 text-center">
                        {passed ? (
                          <span className="text-green-600 font-bold">PASS</span>
                        ) : passed === false ? (
                          <span className="text-red-600 font-bold">FAIL</span>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Stage4Content({
  stage,
  results,
  bidderName,
  isPMU,
  onCalc,
  calcPending,
  onRecommend,
  recommendPending,
}: {
  stage: EvalStage;
  results: Array<{ bid_id: string; developer_id: string; stages: Record<string, EvalBidResult> }>;
  bidderName: (id: string) => string;
  isPMU: boolean;
  onCalc: () => void;
  calcPending: boolean;
  onRecommend: (bidId: string) => void;
  recommendPending: boolean;
}) {
  const s4Results = results.filter((r) => r.stages.stage4);
  const hasCalc = s4Results.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-muted-foreground">
          Weights: {stage.technical_weight_pct ?? 60}% technical / {stage.financial_weight_pct ?? 40}% financial
        </p>
        {stage.status === "active" && isPMU && !hasCalc && (
          <Button
            size="sm"
            className="h-6 text-[10px]"
            onClick={onCalc}
            disabled={calcPending}
          >
            {calcPending ? "Calculating..." : "Calculate Combined Scores & Rank"}
          </Button>
        )}
      </div>

      {hasCalc && (
        <Table>
          <TableHeader>
            <TableRow className="text-[9px]">
              <TableHead className="py-1 text-center">Rank</TableHead>
              <TableHead className="py-1">Bidder</TableHead>
              <TableHead className="py-1 text-center">Technical</TableHead>
              <TableHead className="py-1 text-center">Financial</TableHead>
              <TableHead className="py-1 text-center">Combined</TableHead>
              <TableHead className="py-1 text-center">Award</TableHead>
              {isPMU && <TableHead className="py-1 text-center">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {s4Results
              .sort((a, b) => (a.stages.stage4.stage4_rank ?? 99) - (b.stages.stage4.stage4_rank ?? 99))
              .map((r) => {
                const s4 = r.stages.stage4;
                const s2 = r.stages.stage2;
                const s3 = r.stages.stage3;
                return (
                  <TableRow key={r.bid_id} className="text-[11px]">
                    <TableCell className="py-1 text-center font-bold">{s4.stage4_rank ?? "—"}</TableCell>
                    <TableCell className="py-1 font-medium">{bidderName(r.developer_id)}</TableCell>
                    <TableCell className="py-1 text-center font-mono">{fmt(s2?.stage2_technical_score)}%</TableCell>
                    <TableCell className="py-1 text-center font-mono">{fmt(s3?.stage3_financial_score)}%</TableCell>
                    <TableCell className="py-1 text-center font-mono font-bold text-primary">{fmt(s4.stage4_combined_score)}%</TableCell>
                    <TableCell className="py-1 text-center">
                      {s4.stage4_recommended_for_award ? (
                        <span className="text-[10px] rounded bg-green-100 text-green-800 px-1.5 py-px font-medium">Recommended</span>
                      ) : "—"}
                    </TableCell>
                    {isPMU && (
                      <TableCell className="py-1 text-center">
                        {!s4.stage4_recommended_for_award && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-5 px-2 text-[9px]"
                            onClick={() => onRecommend(r.bid_id)}
                            disabled={recommendPending}
                          >
                            Recommend
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      )}

      {!hasCalc && stage.status !== "active" && (
        <p className="text-[11px] text-muted-foreground">
          Waiting for stages 2 & 3 to complete before combined scoring.
        </p>
      )}
    </div>
  );
}
