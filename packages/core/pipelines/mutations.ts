import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { pipelineKeys } from "./queries";

export function useCancelPipeline() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();

  return useMutation({
    mutationFn: (id: string) => api.cancelPipeline(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: pipelineKeys.detail(wsId, id) });
      qc.invalidateQueries({ queryKey: pipelineKeys.list(wsId) });
    },
  });
}
