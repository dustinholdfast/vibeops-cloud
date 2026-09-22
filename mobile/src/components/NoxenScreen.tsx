import { useAuth } from "@clerk/expo";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ApiError,
  type Brief,
  type Project,
  type Uptime,
  type Workspace,
  localBrief,
  messageFor,
  request,
} from "../api";

const c = {
  bg: "#0D1020",
  surface: "#191D31",
  border: "#343852",
  text: "#F6F4FF",
  muted: "#A8A8BB",
  accent: "#A78BFA",
  green: "#66D5A7",
  red: "#FF7D89",
  amber: "#FFC97C",
};
type Tab = "Brief" | "Projects" | "Uptime";
const newMutationId = () =>
  `mobile_${Date.now()}_${Math.random().toString(36).slice(2)}`;

function Button({
  label,
  onPress,
  subtle = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  subtle?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, subtle && s.buttonSubtle, disabled && { opacity: 0.5 }]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
}

function SignIn() {
  const { startHostedAuth } = useHostedAuth();
  const [busy, setBusy] = useState(false);
  const open = async (mode: "sign-in" | "sign-up") => {
    setBusy(true);
    try {
      await startHostedAuth({ mode });
    } catch (error) {
      Alert.alert("Sign-in failed", messageFor(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.center}>
      <Text style={s.brand}>NOXEN</Text>
      <Text style={s.hero}>Your projects, wherever work happens.</Text>
      <Text style={s.muted}>Sign in to your Noxen Cloud account.</Text>
      <View style={{ height: 28 }} />
      <Button
        label={busy ? "Opening sign-in…" : "Sign in"}
        disabled={busy}
        onPress={() => void open("sign-in")}
      />
      <Button
        label="Create account"
        subtle
        disabled={busy}
        onPress={() => void open("sign-up")}
      />
    </View>
  );
}

function ProjectEditor({
  project,
  onClose,
  onSaved,
  getToken,
  workspaceId,
}: {
  project: Project;
  onClose: () => void;
  onSaved: (project: Project) => void;
  getToken: () => Promise<string | null>;
  workspaceId: string | null;
}) {
  const [name, setName] = useState(project.name);
  const [nextAction, setNextAction] = useState(project.nextAction);
  const [stage, setStage] = useState(project.stage);
  const [priority, setPriority] = useState(project.priority);
  const [health, setHealth] = useState(project.health);
  const [progress, setProgress] = useState(String(project.progress));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mutationId, setMutationId] = useState(newMutationId);
  const change = <T,>(set: (value: T) => void, value: T) => {
    set(value);
    setMutationId(newMutationId());
  };
  const save = async () => {
    const number = Number(progress);
    if (
      !name.trim() ||
      !nextAction.trim() ||
      !Number.isInteger(number) ||
      number < 0 ||
      number > 100
    ) {
      setError("Enter a name, next action, and progress from 0 to 100.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request<{ project: Project }>(
        `/api/projects/${encodeURIComponent(project.id)}`,
        getToken,
        workspaceId,
        {
          method: "PATCH",
          body: JSON.stringify({
            version: project.version,
            mutationId,
            name: name.trim(),
            nextAction: nextAction.trim(),
            stage,
            priority,
            health,
            progress: number,
          }),
        },
      );
      onSaved(result.project);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "CONFLICT"
          ? "This project changed elsewhere. Go back, refresh, and review the latest version."
          : messageFor(caught),
      );
    } finally {
      setBusy(false);
    }
  };
  const choices = <T extends string>(
    label: string,
    value: T,
    options: readonly T[],
    set: (value: T) => void,
  ) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.chips}>
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => change(set, option)}
            style={[s.chip, value === option && s.chipActive]}
          >
            <Text style={[s.chipText, value === option && { color: c.text }]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Button label="← Back to projects" subtle onPress={onClose} />
      <Text style={s.title}>Update project</Text>
      <Text style={s.label}>Name</Text>
      <TextInput
        style={s.input}
        value={name}
        onChangeText={(value) => change(setName, value)}
        maxLength={200}
      />
      <Text style={s.label}>Next action</Text>
      <TextInput
        style={[s.input, { minHeight: 84 }]}
        multiline
        value={nextAction}
        onChangeText={(value) => change(setNextAction, value)}
        maxLength={4000}
      />
      {choices(
        "Stage",
        stage,
        [
          "Exploring",
          "Building",
          "Testing",
          "Live",
          "Paused",
          "Archived",
        ] as const,
        setStage,
      )}
      {choices(
        "Priority",
        priority,
        ["Now", "Next", "Later"] as const,
        setPriority,
      )}
      {choices(
        "Health",
        health,
        ["On track", "At risk", "Blocked"] as const,
        setHealth,
      )}
      <Text style={s.label}>Progress %</Text>
      <TextInput
        style={s.input}
        keyboardType="number-pad"
        value={progress}
        onChangeText={(value) => change(setProgress, value)}
        maxLength={3}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button
        label={busy ? "Saving…" : "Save changes"}
        disabled={busy}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

function Dashboard() {
  const { getToken, signOut, userId } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; projectId?: string }>();
  const tab: Tab =
    params.tab === "Projects" || params.tab === "Uptime" ? params.tab : "Brief";
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [uptime, setUptime] = useState<Uptime | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const api = useCallback(
    <T,>(path: string, scope: string | null = workspaceId) =>
      request<T>(path, getToken, scope),
    [getToken, workspaceId],
  );
  useEffect(() => {
    let alive = true;
    api<{ workspaces: Workspace[] }>("/api/workspaces", null)
      .then((result) => {
        if (alive) setWorkspaces(result.workspaces);
      })
      .catch((caught) => {
        if (alive) setError(messageFor(caught));
      });
    return () => {
      alive = false;
    };
  }, [api, userId]);
  const refresh = useCallback(async () => {
    const thisRequest = ++generation.current;
    try {
      const p = await api<{ projects: Project[] }>("/api/projects");
      const [b, u] = await Promise.all([
        api<Brief>("/api/mobile/brief").catch((caught) => {
          if (caught instanceof ApiError && caught.status === 404)
            return localBrief(p.projects);
          throw caught;
        }),
        api<Uptime>("/api/monitors").catch(() => ({
          available: false,
          monitored: [],
          unmonitored: [],
        })),
      ]);
      if (thisRequest === generation.current) {
        setError("");
        setProjects(p.projects);
        setBrief(b);
        setUptime(u);
      }
    } catch (caught) {
      if (thisRequest === generation.current) setError(messageFor(caught));
    } finally {
      if (thisRequest === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [api]);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  const current = workspaces.find((w) =>
    workspaceId === null ? w.personal : w.workspaceId === workspaceId,
  );
  const recommendation = projects.find(
    (p) => p.id === brief?.recommendation?.projectId,
  );
  const selected = projects.find((p) => p.id === params.projectId);
  if (selected)
    return current?.role === "viewer" ? (
      <View style={s.content}>
        <Button
          label="← Back"
          subtle
          onPress={() => router.setParams({ projectId: "" })}
        />
        <Text style={s.title}>{selected.name}</Text>
        <Text style={s.text}>{selected.nextAction}</Text>
        <Text style={s.muted}>View-only access</Text>
      </View>
    ) : (
      <ProjectEditor
        key={selected.id}
        project={selected}
        getToken={getToken}
        workspaceId={workspaceId}
        onClose={() => router.setParams({ projectId: "" })}
        onSaved={(saved) => {
          setProjects((prev) =>
            prev.map((p) => (p.id === saved.id ? saved : p)),
          );
          router.setParams({ projectId: "" });
          void refresh();
        }}
      />
    );
  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <View>
          <Text style={s.brand}>NOXEN</Text>
          <Text style={s.muted}>Cloud</Text>
        </View>
        <Pressable
          onPress={() => setShowWorkspaces(!showWorkspaces)}
          accessibilityRole="button"
          style={s.workspaceButton}
        >
          <Text style={s.text}>{current?.name ?? "Personal"} ▾</Text>
        </Pressable>
      </View>
      {showWorkspaces ? (
        <View style={s.workspaceMenu}>
          {workspaces.map((w) => (
            <Pressable
              key={w.workspaceId}
              style={s.menuItem}
              onPress={() => {
                const nextId = w.personal ? null : w.workspaceId;
                setShowWorkspaces(false);
                if (nextId !== workspaceId) {
                  setWorkspaceId(nextId);
                  setProjects([]);
                  setBrief(null);
                  setUptime(null);
                  setError("");
                  setLoading(true);
                }
                router.setParams({ projectId: "" });
              }}
            >
              <Text style={s.text}>{w.name}</Text>
              <Text style={s.muted}>{w.role}</Text>
            </Pressable>
          ))}
          <Button label="Sign out" subtle onPress={() => void signOut()} />
        </View>
      ) : null}
      <View style={s.tabs}>
        {(["Brief", "Projects", "Uptime"] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => router.setParams({ tab: item, projectId: "" })}
            style={[s.tab, tab === item && s.activeTab]}
          >
            <Text style={[s.tabText, tab === item && { color: c.text }]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.accent}
            onRefresh={() => {
              setRefreshing(true);
              void refresh();
            }}
          />
        }
      >
        {loading ? (
          <ActivityIndicator
            color={c.accent}
            size="large"
            style={{ marginTop: 40 }}
          />
        ) : null}
        {error ? (
          <View style={s.card}>
            <Text style={s.error}>{error}</Text>
            <Button
              label="Try again"
              onPress={() => {
                setLoading(true);
                setError("");
                void refresh();
              }}
            />
          </View>
        ) : null}
        {!loading && !error && tab === "Brief" ? (
          <>
            <Text style={s.eyebrow}>TODAY&apos;S FOCUS</Text>
            <Text style={s.title}>Daily brief</Text>
            {recommendation ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>{recommendation.name}</Text>
                <Text style={s.text}>{recommendation.nextAction}</Text>
                <Text style={s.accent}>
                  {brief?.recommendation?.reasons.join(" · ")}
                </Text>
                <Button
                  label="Open project"
                  onPress={() => {
                    router.setParams({
                      tab: "Projects",
                      projectId: recommendation.id,
                    });
                  }}
                />
              </View>
            ) : (
              <View style={s.card}>
                <Text style={s.text}>
                  No active projects need attention right now.
                </Text>
              </View>
            )}
            <Text style={s.section}>At a glance</Text>
            <View style={s.card}>
              <Text style={s.text}>
                {projects.length} projects ·{" "}
                {projects.filter((p) => p.priority === "Now").length} marked Now
              </Text>
              <Text style={s.text}>
                {uptime?.monitored.filter((m) => m.status === "down").length ??
                  0}{" "}
                monitors down
              </Text>
            </View>
          </>
        ) : null}
        {!loading && !error && tab === "Projects" ? (
          <>
            <Text style={s.title}>Projects</Text>
            {projects.length === 0 ? (
              <Text style={s.muted}>No projects in this workspace yet.</Text>
            ) : (
              projects.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.setParams({ projectId: p.id })}
                  style={s.card}
                  accessibilityRole="button"
                >
                  <Text style={s.cardTitle}>{p.name}</Text>
                  <Text style={s.muted}>
                    {p.stage} · {p.priority} · {p.health}
                  </Text>
                  <Text style={s.text}>{p.nextAction}</Text>
                  <Text style={s.accent}>
                    {p.progress}% complete · Tap to{" "}
                    {current?.role === "viewer" ? "view" : "update"}
                  </Text>
                </Pressable>
              ))
            )}
          </>
        ) : null}
        {!loading && !error && tab === "Uptime" ? (
          <>
            <Text style={s.title}>Uptime</Text>
            {!uptime?.available ? (
              <Text style={s.muted}>
                Monitoring is unavailable for this workspace.
              </Text>
            ) : (
              <>
                {uptime.monitored.length === 0 ? (
                  <Text style={s.muted}>No projects are monitored yet.</Text>
                ) : null}
                {uptime.monitored.map((row) => (
                  <View key={row.projectId} style={s.card}>
                    <View style={s.row}>
                      <Text style={s.cardTitle}>{row.projectName}</Text>
                      <Text
                        style={{
                          color:
                            row.status === "up"
                              ? c.green
                              : row.status === "down"
                                ? c.red
                                : c.amber,
                        }}
                      >
                        {row.enabled ? row.status.toUpperCase() : "PAUSED"}
                      </Text>
                    </View>
                    <Text style={s.muted}>
                      24h{" "}
                      {row.windows.day.uptimePct == null
                        ? "—"
                        : `${row.windows.day.uptimePct}%`}{" "}
                      · 7d{" "}
                      {row.windows.week.uptimePct == null
                        ? "—"
                        : `${row.windows.week.uptimePct}%`}
                    </Text>
                    {row.lastError ? (
                      <Text style={s.error}>{row.lastError}</Text>
                    ) : null}
                    <Text style={s.muted}>
                      {row.lastCheckedAt
                        ? `Checked ${new Date(row.lastCheckedAt).toLocaleString()}`
                        : "Not checked yet"}
                    </Text>
                  </View>
                ))}
                {uptime.unmonitored.length ? (
                  <Text style={s.muted}>
                    {uptime.unmonitored.length} projects have no monitor.
                  </Text>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  return isSignedIn ? <Dashboard /> : <SignIn />;
}
export default AuthGate;

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 28, gap: 14 },
  brand: { color: c.accent, fontSize: 20, fontWeight: "900", letterSpacing: 3 },
  hero: { color: c.text, fontSize: 30, fontWeight: "700" },
  header: {
    padding: 18,
    borderBottomWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  workspaceButton: {
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  workspaceMenu: { padding: 12, backgroundColor: c.surface },
  menuItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: c.border,
  },
  tab: { flex: 1, padding: 14, alignItems: "center" },
  activeTab: { borderBottomWidth: 2, borderColor: c.accent },
  tabText: { color: c.muted, fontWeight: "700" },
  content: { padding: 18, gap: 14, paddingBottom: 38 },
  eyebrow: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  title: { color: c.text, fontSize: 27, fontWeight: "800" },
  section: { color: c.text, fontSize: 18, fontWeight: "700", marginTop: 12 },
  card: {
    backgroundColor: c.surface,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    gap: 9,
  },
  cardTitle: { color: c.text, fontSize: 17, fontWeight: "700", flex: 1 },
  text: { color: c.text, lineHeight: 22 },
  muted: { color: c.muted, lineHeight: 20 },
  accent: { color: c.accent, lineHeight: 20 },
  error: { color: c.red, lineHeight: 21 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  button: {
    backgroundColor: "#6D4BCC",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 5,
  },
  buttonSubtle: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  buttonText: { color: c.text, fontWeight: "700" },
  field: { gap: 8 },
  label: { color: c.muted, fontWeight: "700", marginTop: 6 },
  input: {
    color: c.text,
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#513B8D", borderColor: c.accent },
  chipText: { color: c.muted },
});
