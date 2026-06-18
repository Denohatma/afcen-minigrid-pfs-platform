"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PHOTO_STATUS_COLORS: Record<string, string> = {
  pass: "bg-green-500",
  amber: "bg-yellow-500",
  red: "bg-red-500",
};

export default function GPSVerificationPage() {
  const queryClient = useQueryClient();
  const [milestoneId, setMilestoneId] = useState("");
  const [searchMilestoneId, setSearchMilestoneId] = useState("");
  const [uploadForm, setUploadForm] = useState({
    milestone_id: "",
    latitude: "",
    longitude: "",
    accuracy_meters: "",
    device_id: "",
    captured_at: "",
  });

  const { data: summaryData } = useQuery({
    queryKey: ["gps-milestone", searchMilestoneId],
    queryFn: () => api.gpsVerification.getMilestonePhotos(searchMilestoneId),
    enabled: !!searchMilestoneId,
  });

  const { data: ivaData } = useQuery({
    queryKey: ["iva-visits"],
    queryFn: () => api.gpsVerification.listIVAVisits(),
  });

  const uploadMutation = useMutation({
    mutationFn: () =>
      api.gpsVerification.uploadPhoto({
        milestone_id: uploadForm.milestone_id,
        latitude: parseFloat(uploadForm.latitude) || 0,
        longitude: parseFloat(uploadForm.longitude) || 0,
        accuracy_meters: parseFloat(uploadForm.accuracy_meters) || 0,
        device_id: uploadForm.device_id,
        captured_at: uploadForm.captured_at,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gps-milestone"] });
      setUploadForm({
        milestone_id: "",
        latitude: "",
        longitude: "",
        accuracy_meters: "",
        device_id: "",
        captured_at: "",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.gpsVerification.approveMilestone(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gps-milestone"] }),
  });

  const flagIVAMutation = useMutation({
    mutationFn: (id: string) => api.gpsVerification.flagForIVA(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gps-milestone"] });
      queryClient.invalidateQueries({ queryKey: ["iva-visits"] });
    },
  });

  const photos = summaryData?.photos || [];
  const visits = ivaData?.visits || [];
  const totalPhotos = summaryData?.total_photos || photos.length;
  const passingCount = summaryData?.passing || photos.filter((p) => p.overall_status === "pass").length;
  const amberCount = summaryData?.amber || photos.filter((p) => p.overall_status === "amber").length;
  const redCount = summaryData?.red || photos.filter((p) => p.overall_status === "red").length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">GPS Remote Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            GPS-tagged photo evidence for RBF milestone verification
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalPhotos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Passing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{passingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Amber Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{amberCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Red Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{redCount}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="verify" className="mt-6">
        <TabsList>
          <TabsTrigger value="verify">Milestone Verification</TabsTrigger>
          <TabsTrigger value="upload">Upload Photo</TabsTrigger>
          <TabsTrigger value="iva">IVA Visits ({visits.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="verify" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Verify Milestone Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 mb-6">
                <div className="flex-1">
                  <Label>Milestone ID</Label>
                  <Input
                    placeholder="Enter milestone ID to load photos"
                    value={milestoneId}
                    onChange={(e) => setMilestoneId(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => setSearchMilestoneId(milestoneId)}
                  disabled={!milestoneId}
                >
                  Load Photos
                </Button>
              </div>

              {searchMilestoneId && photos.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No photos found for this milestone
                </div>
              ) : photos.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Filename</TableHead>
                        <TableHead>Lat / Lon</TableHead>
                        <TableHead className="text-right">Accuracy (m)</TableHead>
                        <TableHead className="text-right">Distance (km)</TableHead>
                        <TableHead>Coord Check</TableHead>
                        <TableHead>Time Check</TableHead>
                        <TableHead>Dup Check</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Captured</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {photos.map((photo) => (
                        <TableRow key={photo.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-3 w-3 rounded-full ${
                                  PHOTO_STATUS_COLORS[photo.overall_status] || "bg-gray-400"
                                }`}
                              />
                              <span className="text-xs capitalize">{photo.overall_status}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{photo.photo_filename}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                          </TableCell>
                          <TableCell className="text-right">{photo.accuracy_meters.toFixed(1)}</TableCell>
                          <TableCell className="text-right">{photo.distance_from_site_km.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                photo.coordinate_check === "pass"
                                  ? "bg-green-100 text-green-700"
                                  : photo.coordinate_check === "amber"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }
                            >
                              {photo.coordinate_check}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                photo.timestamp_check === "pass"
                                  ? "bg-green-100 text-green-700"
                                  : photo.timestamp_check === "amber"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }
                            >
                              {photo.timestamp_check}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                photo.duplicate_check === "pass"
                                  ? "bg-green-100 text-green-700"
                                  : photo.duplicate_check === "amber"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                              }
                            >
                              {photo.duplicate_check}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{photo.device_id}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(photo.captured_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="mt-4 flex gap-3">
                    <Button
                      onClick={() => approveMutation.mutate(searchMilestoneId)}
                      disabled={approveMutation.isPending || !(summaryData?.can_approve)}
                    >
                      {approveMutation.isPending ? "Approving..." : "Approve Milestone"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => flagIVAMutation.mutate(searchMilestoneId)}
                      disabled={flagIVAMutation.isPending}
                    >
                      {flagIVAMutation.isPending ? "Flagging..." : "Flag for IVA Visit"}
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload GPS-Tagged Photo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Milestone ID *</Label>
                  <Input
                    value={uploadForm.milestone_id}
                    onChange={(e) => setUploadForm((f) => ({ ...f, milestone_id: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Device ID *</Label>
                  <Input
                    placeholder="Device identifier"
                    value={uploadForm.device_id}
                    onChange={(e) => setUploadForm((f) => ({ ...f, device_id: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Latitude *</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="e.g. 9.0579"
                    value={uploadForm.latitude}
                    onChange={(e) => setUploadForm((f) => ({ ...f, latitude: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Longitude *</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="e.g. 7.4951"
                    value={uploadForm.longitude}
                    onChange={(e) => setUploadForm((f) => ({ ...f, longitude: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Accuracy (meters) *</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="GPS accuracy in meters"
                    value={uploadForm.accuracy_meters}
                    onChange={(e) => setUploadForm((f) => ({ ...f, accuracy_meters: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Captured At *</Label>
                  <Input
                    type="datetime-local"
                    value={uploadForm.captured_at}
                    onChange={(e) => setUploadForm((f) => ({ ...f, captured_at: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                className="mt-4"
                onClick={() => uploadMutation.mutate()}
                disabled={
                  uploadMutation.isPending ||
                  !uploadForm.milestone_id ||
                  !uploadForm.latitude ||
                  !uploadForm.longitude ||
                  !uploadForm.device_id
                }
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload Photo Data"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="iva" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {visits.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No IVA visits scheduled
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Milestone</TableHead>
                      <TableHead>Trigger Reason</TableHead>
                      <TableHead>IVA Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((visit) => (
                      <TableRow key={visit.id}>
                        <TableCell className="font-mono text-xs">{visit.site_id.slice(0, 8)}...</TableCell>
                        <TableCell className="font-mono text-xs">{visit.milestone_id.slice(0, 8)}...</TableCell>
                        <TableCell className="capitalize">
                          {visit.trigger_reason.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>{visit.iva_name}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              visit.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : visit.status === "scheduled"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                            }
                          >
                            {visit.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {visit.verification_result ? (
                            <Badge
                              className={
                                visit.verification_result === "verified"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }
                            >
                              {visit.verification_result}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
