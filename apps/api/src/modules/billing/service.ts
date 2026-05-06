import { prisma } from "../../config/prisma";

export type DispatchCapability = {
  canDispatch: boolean;
  blockReason: string | null;
  workspace: {
    id: string;
    plan: string;
    subscriptionStatus: string;
    trialStartedAt: Date | null;
    trialEndsAt: Date | null;
    commentLimit: number;
    commentsSentCount: number;
  };
};

export async function getWorkspaceDispatchCapability(workspaceId: string): Promise<DispatchCapability> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      plan: true,
      subscriptionStatus: true,
      trialStartedAt: true,
      trialEndsAt: true,
      commentLimit: true,
      commentsSentCount: true
    }
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  if (workspace.subscriptionStatus === "active") {
    return { canDispatch: true, blockReason: null, workspace };
  }

  if (workspace.subscriptionStatus === "trialing") {
    const now = new Date();
    if (workspace.trialEndsAt && now > workspace.trialEndsAt) {
      return {
        canDispatch: false,
        blockReason: "Trial ended. Upgrade to continue sending comments.",
        workspace
      };
    }

    if (workspace.commentsSentCount >= workspace.commentLimit) {
      return {
        canDispatch: false,
        blockReason: "Trial comment limit reached. Upgrade to continue.",
        workspace
      };
    }

    return { canDispatch: true, blockReason: null, workspace };
  }

  return {
    canDispatch: false,
    blockReason: "Subscription inactive. Upgrade to continue sending comments.",
    workspace
  };
}

export async function assertWorkspaceCanDispatch(workspaceId: string): Promise<DispatchCapability> {
  const status = await getWorkspaceDispatchCapability(workspaceId);
  if (!status.canDispatch) {
    throw new Error(status.blockReason || "Dispatch is blocked for workspace");
  }
  return status;
}
