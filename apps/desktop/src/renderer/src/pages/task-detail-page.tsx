import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TaskDetail } from "@multica/views/tasks";
import { useWorkspaceId } from "@multica/core/hooks";
import { planningTaskDetailOptions } from "@multica/core/tasks/queries";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wsId = useWorkspaceId();
  const { data: task } = useQuery(planningTaskDetailOptions(wsId, id!));

  useDocumentTitle(task ? `TASK-${task.number}: ${task.title}` : "Task");

  if (!id) return null;
  return <TaskDetail taskId={id} />;
}
