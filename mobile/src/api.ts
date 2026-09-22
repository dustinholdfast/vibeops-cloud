export const API_BASE = "https://noxencloud.com";

export type Workspace = {
  workspaceId: string;
  name: string;
  personal: boolean;
  role: "owner" | "admin" | "member" | "viewer";
};

export type Project = {
  id: string;
  version: number;
  name: string;
  nextAction: string;
  stage: "Exploring" | "Building" | "Testing" | "Live" | "Paused" | "Archived";
  priority: "Now" | "Next" | "Later";
  health: "On track" | "At risk" | "Blocked";
  progress: number;
  targetDate: string | null;
  lastTouched: string;
  createdAt: string;
};

export type Brief = {
  recommendation: {
    projectId: string;
    reasons: string[];
    deadline: string;
  } | null;
};

export type Uptime = {
  available: boolean;
  monitored: {
    projectId: string;
    projectName: string;
    status: "up" | "down" | "unknown";
    enabled: boolean;
    lastCheckedAt: string | null;
    lastError: string | null;
    windows: {
      day: { uptimePct: number | null };
      week: { uptimePct: number | null };
    };
  }[];
  unmonitored: { id: string; name: string }[];
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  getToken: () => Promise<string | null>,
  workspaceId: string | null = null,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Please sign in again.");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(workspaceId ? { "x-vibeops-workspace": workspaceId } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.code ?? "REQUEST_FAILED",
      body?.error ?? "Request failed. Try again.",
    );
  }
  return body as T;
}

export function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}

/** Matches the existing dashboard ranking until the mobile brief route is deployed. */
export function localBrief(projects: Project[], now = new Date()): Brief {
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const ranked = projects
    .filter((p) => ["Exploring", "Building", "Testing"].includes(p.stage))
    .map((project) => {
      let score = 0;
      const reasons: string[] = [];
      if (project.health === "Blocked") {
        score += 100;
        reasons.push("Blocked");
      } else if (project.health === "At risk") {
        score += 45;
        reasons.push("At risk");
      }
      let deadline = "none";
      if (project.targetDate) {
        const [year, month, day] = project.targetDate.split("-").map(Number);
        const days = Math.round(
          (new Date(year, month - 1, day).getTime() - today) / 86400000,
        );
        if (days < 0) {
          score += 80;
          deadline = "overdue";
          reasons.push("Overdue");
        } else if (days === 0) {
          score += 60;
          deadline = "due-today";
          reasons.push("Due today");
        } else if (days <= 7) {
          score += 30;
          deadline = "due-soon";
          reasons.push("Due soon");
        } else deadline = "future";
      }
      if (project.priority === "Now") score += 30;
      if (project.priority === "Next") score += 15;
      const touched = new Date(project.lastTouched);
      const staleDays = Math.max(
        0,
        Math.round(
          (today -
            new Date(
              touched.getFullYear(),
              touched.getMonth(),
              touched.getDate(),
            ).getTime()) /
            86400000,
        ),
      );
      if (staleDays >= 7) {
        score += Math.min(30, staleDays);
        reasons.push(`Untouched ${staleDays} days`);
      }
      if (project.stage === "Testing") score += 8;
      if (!reasons.length)
        reasons.push(
          project.priority === "Now"
            ? "Claimed for today"
            : "Ready to move forward",
        );
      return { project, score, reasons, deadline };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(a.project.createdAt).getTime() -
          new Date(b.project.createdAt).getTime(),
    );
  const top = ranked[0];
  return {
    recommendation: top
      ? {
          projectId: top.project.id,
          reasons: top.reasons,
          deadline: top.deadline,
        }
      : null,
  };
}
