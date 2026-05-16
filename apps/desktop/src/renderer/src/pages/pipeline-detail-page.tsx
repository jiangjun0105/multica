import { useParams } from "react-router-dom";
import { PipelineDetail } from "@multica/views/pipelines";

export function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <PipelineDetail pipelineId={id} />;
}
