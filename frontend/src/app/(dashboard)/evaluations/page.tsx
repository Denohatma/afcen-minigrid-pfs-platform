"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function EvaluationsPage() {
  const queryClient = useQueryClient();
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null);

  const { data: portfolioData } = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => api.portfolios.list(),
  });

  const tenderedPortfolios = portfolioData?.portfolios.filter(
    (p) => ["tendered", "awarded"].includes(p.status)
  ) || [];

  const { data: evaluationData } = useQuery({
    queryKey: ["evaluations", selectedTenderId],
    queryFn: () => selectedTenderId ? api.evaluations.getTenderEvaluations(selectedTenderId) : null,
    enabled: !!selectedTenderId,
  });

  const scoreMutation = useMutation({
    mutationFn: (tenderId: string) => api.evaluations.scoreTender(tenderId),
    onSuccess: (_, tenderId) => {
      queryClient.invalidateQueries({ queryKey: ["evaluations", tenderId] });
    },
  });

  const recommendMutation = useMutation({
    mutationFn: (evalId: string) => api.evaluations.recommend(evalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluations", selectedTenderId] });
    },
  });

  const awardMutation = useMutation({
    mutationFn: (evalId: string) =>
      selectedTenderId ? api.evaluations.awardTender(selectedTenderId, evalId) : Promise.reject(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluations", selectedTenderId] });
      queryClient.invalidateQueries({ queryKey: ["portfolios"] });
    },
  });

  const evaluations = evaluationData?.evaluations || [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Bid Evaluation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-assisted bid scoring with human validation
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {tenderedPortfolios.map((p) => (
          <Card
            key={p.id}
            className={`cursor-pointer transition-shadow hover:shadow-md ${selectedTenderId === p.id ? "ring-2 ring-primary" : ""}`}
            onClick={() => setSelectedTenderId(p.id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{p.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge>{p.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedTenderId && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold">Evaluation Results</h2>
            <Button
              onClick={() => scoreMutation.mutate(selectedTenderId)}
              disabled={scoreMutation.isPending}
            >
              {scoreMutation.isPending ? "Scoring..." : "Run AI Scoring"}
            </Button>
          </div>

          {evaluations.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No evaluations yet. Click &quot;Run AI Scoring&quot; to evaluate submitted bids.
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="comparison">
              <TabsList>
                <TabsTrigger value="comparison">Comparison Matrix</TabsTrigger>
                <TabsTrigger value="details">Detailed Scores</TabsTrigger>
              </TabsList>

              <TabsContent value="comparison" className="mt-4">
                <Card>
                  <CardContent className="pt-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company</TableHead>
                          <TableHead className="text-right">AI Score</TableHead>
                          <TableHead className="text-right">Final Score</TableHead>
                          <TableHead>DARES Eligible</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Red Flags</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {evaluations
                          .sort((a, b) => b.final_score - a.final_score)
                          .map((ev) => (
                            <TableRow key={ev.id}>
                              <TableCell className="font-medium">{ev.company_name}</TableCell>
                              <TableCell className="text-right">{ev.ai_total_score.toFixed(1)}</TableCell>
                              <TableCell className="text-right font-bold">{ev.final_score.toFixed(1)}</TableCell>
                              <TableCell>
                                <Badge className={ev.dares_eligible ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                  {ev.dares_eligible ? "Yes" : "No"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{ev.confidence_level}</Badge>
                              </TableCell>
                              <TableCell>
                                {ev.ai_red_flags.length > 0 ? (
                                  <Badge className="bg-red-100 text-red-700">{ev.ai_red_flags.length} flags</Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">None</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {ev.recommended_for_award ? (
                                  <Badge className="bg-green-600 text-white">Recommended</Badge>
                                ) : ev.award_approved ? (
                                  <Badge className="bg-primary text-white">Awarded</Badge>
                                ) : (
                                  <Badge variant="outline">{ev.status}</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  {!ev.recommended_for_award && !ev.award_approved && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => recommendMutation.mutate(ev.id)}
                                      disabled={recommendMutation.isPending}
                                    >
                                      Recommend
                                    </Button>
                                  )}
                                  {ev.recommended_for_award && !ev.award_approved && (
                                    <Button
                                      size="sm"
                                      onClick={() => awardMutation.mutate(ev.id)}
                                      disabled={awardMutation.isPending}
                                    >
                                      Award
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="details" className="mt-4 space-y-4">
                {evaluations.map((ev) => (
                  <Card key={ev.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>{ev.company_name}</CardTitle>
                        <Badge>{ev.final_score.toFixed(1)} / 100</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{ev.ai_summary}</p>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Criterion</TableHead>
                            <TableHead className="text-right">Weight</TableHead>
                            <TableHead className="text-right">AI Score</TableHead>
                            <TableHead className="text-right">Human Score</TableHead>
                            <TableHead className="text-right">Final</TableHead>
                            <TableHead>Reasoning</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(ev.scores || []).map((score) => (
                            <TableRow key={score.id}>
                              <TableCell className="font-medium">{score.criterion}</TableCell>
                              <TableCell className="text-right">{(score.weight * 100).toFixed(0)}%</TableCell>
                              <TableCell className="text-right">{score.ai_score.toFixed(1)}</TableCell>
                              <TableCell className="text-right">{score.human_score?.toFixed(1) ?? "—"}</TableCell>
                              <TableCell className="text-right font-bold">{score.final_score.toFixed(1)}</TableCell>
                              <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                                {score.ai_reasoning}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {ev.ai_red_flags.length > 0 && (
                        <div className="mt-4 rounded-md bg-red-50 p-3">
                          <p className="text-sm font-medium text-red-700">Red Flags:</p>
                          <ul className="mt-1 list-disc pl-5 text-sm text-red-600">
                            {ev.ai_red_flags.map((flag, i) => (
                              <li key={i}>{flag}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {ev.ai_comparative_notes && (
                        <div className="mt-3 rounded-md bg-blue-50 p-3">
                          <p className="text-sm font-medium text-blue-700">Comparative Notes:</p>
                          <p className="text-sm text-blue-600">{ev.ai_comparative_notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </div>
  );
}
