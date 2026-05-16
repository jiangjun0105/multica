"use client";

import { use } from "react";
import { PipelineDetail } from "@multica/views/pipelines";

export default function PipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <PipelineDetail pipelineId={id} />;
}
