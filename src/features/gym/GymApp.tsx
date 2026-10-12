import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  CircleHelp,
  Dumbbell,
  Eye,
  EyeOff,
  GripVertical,
  History,
  ImagePlus,
  LogOut,
  Mail,
  Menu,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UserRound,
  Weight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearSavedMemberSession,
  completeGoogleSignIn,
  confirmMemberSignUp,
  convertWeight,
  deleteProfilePhoto,
  getAwsAppConfig,
  getSavedMemberSession,
  latestExerciseSets,
  loadMemberData,
  loadProfilePhoto,
  removePlannedExercise,
  requestPasswordReset,
  resetMemberPassword,
  resendMemberConfirmation,
  saveMemberProfile,
  savePlannedExercise,
  savePlannedExercises,
  saveWorkoutSession,
  signInMember,
  signUpMember,
  sortPlannedExercises,
  startGoogleSignIn,
  uploadProfilePhoto,
  type GymProfile,
  type LoggedSet,
  type MemberSession,
  type PlannedExercise,
  type WeightUnit,
  type WorkoutSession,
} from "@/lib/gym-aws";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const EXERCISE_PRESETS = [
  "Barbell bench press", "Incline dumbbell press", "Chest press", "Cable fly",
  "Lat pulldown", "Seated cable row", "Barbell row", "Pull-up",
  "Shoulder press", "Lateral raise", "Face pull", "Barbell squat",
  "Leg press", "Romanian deadlift", "Leg curl", "Calf raise",
  "Bicep curl", "Hammer curl", "Tricep pushdown", "Overhead tricep extension",
];

type AuthView = "signin" | "signup" | "confirm" | "forgot" | "reset";
type AppView = "plan" | "history" | "profile" | "workout";

function displayError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  if (message.includes("NotAuthorizedException")) return "That email or password doesn't match. Try again.";
  if (message.includes("UserNotConfirmedException")) return "Confirm your account with the code we sent you first.";
  if (message.includes("UsernameExistsException")) return "An account already exists with those details. Sign in instead.";
  if (message.includes("CodeMismatchException") || message.includes("ExpiredCodeException")) return "That code has expired or doesn't match. Request a new one and try again.";
  if (message.includes("TooManyRequestsException") || message.includes("LimitExceededException")) return "Too many attempts. Wait a little, then try again.";
  if (message.includes("NetworkError") || message.includes("Failed to fetch")) return "Could not reach AWS. Check your connection and app setup.";
  return message;
}

function createEmptyProfile(session: MemberSession): GymProfile {
  return {
    name: "",
    email: session.email,
    phone: session.phone,
    heightCm: null,
    bodyWeight: null,
    weightUnit: "kg",
    avatarKey: "",
    updatedAt: new Date().toISOString(),
  };
}

function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

function prettyDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fullDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function createId(): string {
  return crypto.randomUUID();
}

function InitialAvatar({ name, imageUrl, className = "" }: { name: string; imageUrl?: string | null; className?: string }) {
  return imageUrl ? (
    <img src={imageUrl} alt="Member profile" className={`object-cover ${className}`} />
  ) : (
    <span className={`grid place-items-center bg-primary/15 font-semibold text-primary ${className}`}>
      {name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || <UserRound className="size-5" />}
    </span>
  );
}

function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid place-items-center rounded-[5px] bg-primary text-primary-foreground ${small ? "size-8" : "size-9"}`}>
        <Dumbbell className={small ? "size-4" : "size-[18px]"} strokeWidth={2.3} />
      </span>
      <span className="text-[15px] font-bold tracking-[0.09em] text-foreground">IRONPATH</span>
    </div>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: (session: MemberSession) => Promise<void> }) {
  const [view, setView] = useState<AuthView>("signin");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const configured = Boolean(getAwsAppConfig());
  const config = getAwsAppConfig();
  const googleConfigured = Boolean(config?.hostedUiDomain);

  function moveTo(next: AuthView) {
    setError("");
    setNotice("");
    setView(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (view === "signup" && password !== confirmPassword) {
      setError("Those passwords don't match yet.");
      return;
    }
    setBusy(true);
    try {
      if (view === "signin") {
        const session = await signInMember({ identifier, password });
        await onSignedIn(session);
      } else if (view === "signup") {
        await signUpMember({
          method,
          email: method === "email" ? identifier : "",
          phone: method === "phone" ? identifier : "",
          password,
        });
        moveTo("confirm");
        setNotice(`Your verification code is on its way to ${identifier}.`);
      } else if (view === "confirm") {
        await confirmMemberSignUp(identifier, code);
        moveTo("signin");
        setNotice("Your account is confirmed. Sign in to start your training log.");
      } else if (view === "forgot") {
        await requestPasswordReset(identifier);
        moveTo("reset");
        setNotice(`Enter the recovery code we sent to ${identifier}.`);
      } else {
        await resetMemberPassword({ identifier, code, password });
        moveTo("signin");
        setPassword("");
        setNotice("Password updated. You can sign in now.");
      }
    } catch (caught) {
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function sendGoogle() {
    setBusy(true);
    setError("");
    try {
      await startGoogleSignIn();
    } catch (caught) {
      setError(displayError(caught));
      setBusy(false);
    }
  }

  const authHeading = view === "signup" ? "Create your account"
    : view === "confirm" ? "Check your inbox"
      : view === "forgot" ? "Reset your password"
        : view === "reset" ? "Choose a new password"
          : "Your next best set starts here.";

  return (
    <main className="auth-shell dark flex min-h-svh flex-col bg-background lg:flex-row">
      <section className="auth-visual relative flex min-h-[36vh] flex-col justify-between overflow-hidden px-6 pb-6 pt-5 sm:min-h-[42vh] sm:px-10 lg:min-h-svh lg:w-[53%] lg:px-14 lg:py-10">
        <img className="absolute inset-0 size-full object-cover object-[center_42%]" src={trainingPhoto} alt="Athlete training on the chest press" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-background/15" />
        <div className="relative z-10"><Wordmark /></div>
        <div className="relative z-10 max-w-lg pb-2 lg:pb-4">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-primary-foreground/85">
            <span className="size-1.5 rounded-full bg-primary" /> Your training, in your hands
          </div>
          <h1 className="max-w-lg text-[clamp(2.1rem,5vw,4.4rem)] font-bold leading-[1.02] text-foreground">
            Strength is built <span className="text-primary">one set</span> at a time.
          </h1>
          <div className="mt-6 hidden items-center gap-6 text-sm text-foreground/80 sm:flex">
            <span className="flex items-center gap-2"><Activity className="size-4 text-primary" /> Your plan, your pace</span>
            <span className="flex items-center gap-2"><BarChart3 className="size-4 text-primary" /> Progress that adds up</span>
          </div>
        </div>
      </section>

      <section className="auth-panel flex min-h-[62svh] items-center justify-center px-5 py-8 sm:px-10 lg:min-h-svh lg:w-[47%] lg:px-12">
        <div className="w-full max-w-[410px]">
          <div className="mb-8 lg:hidden"><Wordmark small /></div>
          <div className="mb-7">
            {view === "signin" && <p className="mb-2 text-sm font-medium text-primary">WELCOME BACK</p>}
            <h2 className="text-3xl font-bold tracking-tight text-foreground">{authHeading}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {view === "signin" ? "Pick up where your last workout left off."
                : view === "signup" ? "One account for every rep, set, and new personal best."
                  : view === "confirm" ? "Enter the 6-digit code to finish setting up your account."
                    : view === "forgot" ? "We'll send a recovery code to the email or phone on your account."
                      : "Use your recovery code to securely update your password."}
            </p>
          </div>

          {!configured && (
            <div className="mb-5 flex gap-3 border border-primary/25 bg-primary/5 p-3.5 text-sm leading-5 text-foreground" role="status">
              <CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>AWS sign-in isn't connected yet. Finish the steps in <strong>docs/AWS_SETUP.md</strong>, then add the stack outputs to your app configuration.</span>
            </div>
          )}
          {error && <div className="mb-4 border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">{error}</div>}
          {notice && <div className="mb-4 border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-foreground" role="status">{notice}</div>}

          {view === "signup" && (
            <div className="mb-5 grid grid-cols-2 border border-border p-1" role="group" aria-label="Choose sign-up method">
              <button type="button" onClick={() => { setMethod("email"); setIdentifier(""); }} className={`flex h-10 items-center justify-center gap-2 text-sm font-medium transition-colors ${method === "email" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><Mail className="size-4" /> Email</button>
              <button type="button" onClick={() => { setMethod("phone"); setIdentifier(""); }} className={`flex h-10 items-center justify-center gap-2 text-sm font-medium transition-colors ${method === "phone" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><Smartphone className="size-4" /> Phone</button>
            </div>
          )}

          <form className="space-y-4" onSubmit={submit}>
            {!["confirm", "reset"].includes(view) && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">{method === "phone" && view === "signup" ? "Phone number" : view === "forgot" ? "Email or phone number" : "Email or phone number"}</span>
                <Input
                  autoComplete={method === "phone" ? "tel" : "email"}
                  type={method === "phone" && view === "signup" ? "tel" : "text"}
                  inputMode={method === "phone" && view === "signup" ? "tel" : "email"}
                  placeholder={method === "phone" && view === "signup" ? "+1 415 555 0123" : "you@example.com"}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                  disabled={!configured || busy}
                  className="h-11 border-border bg-input/35 text-foreground placeholder:text-muted-foreground"
                  aria-label="Email or phone number"
                />
                {method === "phone" && view === "signup" && <span className="block text-xs text-muted-foreground">Include your country code, for example +14155550123.</span>}
              </label>
            )}
            {["confirm", "reset"].includes(view) && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Verification code</span>
                <Input inputMode="numeric" autoComplete="one-time-code" placeholder="Enter 6-digit code" value={code} onChange={(event) => setCode(event.target.value)} required disabled={!configured || busy} className="h-11 border-border bg-input/35 text-foreground" />
              </label>
            )}
            {["signin", "signup", "reset"].includes(view) && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">{view === "reset" ? "New password" : "Password"}</span>
                <span className="relative block">
                  <Input type={showPassword ? "text" : "password"} autoComplete={view === "signin" ? "current-password" : "new-password"} placeholder="At least 8 characters" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || busy} className="h-11 border-border bg-input/35 pr-11 text-foreground placeholder:text-muted-foreground" />
                  <button type="button" className="absolute right-0 top-0 grid size-11 place-items-center text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                </span>
              </label>
            )}
            {view === "signup" && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-foreground">Confirm password</span>
                <Input type="password" autoComplete="new-password" minLength={8} placeholder="Enter your password again" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={!configured || busy} className="h-11 border-border bg-input/35 text-foreground placeholder:text-muted-foreground" />
              </label>
            )}
            {view === "signin" && <div className="flex justify-end"><button type="button" onClick={() => moveTo("forgot")} className="text-sm font-medium text-primary hover:text-primary/80">Forgot password?</button></div>}
            <Button type="submit" disabled={!configured || busy} className="h-11 w-full font-semibold">
              {busy ? "Please wait…" : view === "signin" ? "Sign in" : view === "signup" ? "Create account" : view === "confirm" ? "Verify account" : view === "forgot" ? "Send recovery code" : "Update password"}
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>

          {view === "confirm" && <div className="mt-4 text-center"><button type="button" disabled={!configured || busy} onClick={async () => { setError(""); try { await resendMemberConfirmation(identifier); setNotice("A fresh code is on its way."); } catch (caught) { setError(displayError(caught)); } }} className="text-sm font-medium text-primary disabled:opacity-50">Resend code</button></div>}
          {view === "reset" && <div className="mt-4 text-center"><button type="button" disabled={!configured || busy} onClick={async () => { setError(""); try { await requestPasswordReset(identifier); setNotice("A new recovery code is on its way."); } catch (caught) { setError(displayError(caught)); } }} className="text-sm font-medium text-primary disabled:opacity-50">Resend recovery code</button></div>}

          {view === "signin" && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" /></div>
              <Button type="button" variant="outline" disabled={!configured || !googleConfigured || busy} onClick={sendGoogle} className="h-11 w-full border-border bg-transparent font-medium text-foreground">
                <GoogleMark /> Continue with Google
              </Button>
            </>
          )}

          <div className="mt-7 text-center text-sm text-muted-foreground">
            {view === "signin" ? <>New to Ironpath? <button type="button" onClick={() => moveTo("signup")} className="font-semibold text-primary hover:text-primary/80">Create an account</button></>
              : view === "signup" ? <>Already have an account? <button type="button" onClick={() => moveTo("signin")} className="font-semibold text-primary hover:text-primary/80">Sign in</button></>
                : <button type="button" onClick={() => moveTo("signin")} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:text-primary/80"><ArrowLeft className="size-3.5" /> Back to sign in</button>}
          </div>
          <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5" /> Your account and progress stay private.</p>
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return <span aria-hidden="true" className="grid size-4 place-items-center rounded-full bg-background text-[12px] font-bold text-primary">G</span>;
}

function GymWorkspace({
  session,
  initialProfile,
  initialPlan,
  initialHistory,
  onSignOut,
}: {
  session: MemberSession;
  initialProfile: GymProfile;
  initialPlan: PlannedExercise[];
  initialHistory: WorkoutSession[];
  onSignOut: () => void;
}) {
  const [view, setView] = useState<AppView>("plan");
  const [profile, setProfile] = useState(initialProfile);
  const [plan, setPlan] = useState(initialPlan);
  const [history, setHistory] = useState(initialHistory);
  const [selectedDay, setSelectedDay] = useState(todayIndex());
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [draggedExerciseId, setDraggedExerciseId] = useState<string | null>(null);
  const [dragOverExerciseId, setDragOverExerciseId] = useState<string | null>(null);
  const [customExercise, setCustomExercise] = useState("");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [draftSets, setDraftSets] = useState<Record<string, { reps: string; weight: string }[]>>({});
  const [startedAt] = useState(new Date().toISOString());
  const [historyFilter, setHistoryFilter] = useState("all");

  const dayPlan = useMemo(() => sortPlannedExercises(plan.filter((exercise) => exercise.day === selectedDay)), [plan, selectedDay]);
  const completedToday = history.filter((workout) => new Date(workout.completedAt).toDateString() === new Date().toDateString()).length;
  const weekSessions = history.filter((workout) => Date.now() - new Date(workout.completedAt).getTime() < 7 * 86400000).length;
  const dayProgress = dayPlan.length ? Math.round((dayPlan.filter((exercise) => latestExerciseSets(history, exercise.exerciseId).length > 0).length / dayPlan.length) * 100) : 0;
  const exerciseSuggestions = useMemo(() => {
    const fromPlan = plan.map((item) => item.exerciseName);
    const fromHistory = history.flatMap((session) => session.sets.map((set) => set.exerciseName));
    return Array.from(new Set([...EXERCISE_PRESETS, ...fromPlan, ...fromHistory])).sort((a, b) => a.localeCompare(b));
  }, [plan, history]);

  useEffect(() => {
    let disposed = false;
    if (profile.avatarKey) {
      void loadProfilePhoto(session, profile.avatarKey).then((url) => {
        if (!disposed && url) setImageUrl(url);
      }).catch(() => undefined);
    }
    return () => { disposed = true; };
  }, [profile.avatarKey, session]);

  function clearFeedback() { setNotice(""); setError(""); }

  async function saveProfile() {
    clearFeedback();
    setBusy(true);
    try {
      const updated = { ...profile, updatedAt: new Date().toISOString() };
      await saveMemberProfile(session, updated);
      setProfile(updated);
      setNotice("Your profile is up to date.");
    } catch (caught) { setError(displayError(caught)); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    clearFeedback();
    setBusy(true);
    try {
      const uploaded = await uploadProfilePhoto(session, file);
      if (profile.avatarKey) await deleteProfilePhoto(session, profile.avatarKey).catch(() => undefined);
      setProfile((current) => ({ ...current, avatarKey: uploaded.key }));
      setImageUrl(uploaded.imageUrl);
      const updated = { ...profile, avatarKey: uploaded.key, updatedAt: new Date().toISOString() };
      await saveMemberProfile(session, updated);
      setProfile(updated);
      setNotice("Profile photo saved.");
    } catch (caught) { setError(displayError(caught)); }
    finally { setBusy(false); }
  }

  async function addExercise(name: string) {
    const cleaned = name.trim();
    if (!cleaned) return;
    const currentDay = plan.filter((item) => item.day === selectedDay);
    const maxOrder = currentDay.reduce(
      (max, item, idx) => Math.max(max, typeof item.order === "number" ? item.order : idx + 1),
      0,
    );
    const now = new Date().toISOString();
    const exercise: PlannedExercise = {
      day: selectedDay,
      exerciseId: createId(),
      exerciseName: cleaned,
      targetSets: 3,
      targetReps: 10,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    clearFeedback();
    setBusy(true);
    try {
      await savePlannedExercise(session, exercise);
      setPlan((current) => [...current, exercise]);
      setDraftSets((current) => ({ ...current, [exercise.exerciseId]: Array.from({ length: 3 }, () => ({ reps: "", weight: "" })) }));
      setNotice(`${cleaned} added to ${WEEKDAYS[selectedDay]}.`);
      setCustomExercise("");
      setExerciseSearch("");
      setShowExercisePicker(false);
    } catch (caught) { setError(displayError(caught)); }
    finally { setBusy(false); }
  }

  async function reorderExercises(newOrderedDayPlan: PlannedExercise[]) {
    clearFeedback();
    const now = new Date().toISOString();
    const updatedDayExercises = newOrderedDayPlan.map((item, index) => ({
      ...item,
      order: index + 1,
      updatedAt: now,
    }));
    const updatedDayMap = new Map(updatedDayExercises.map((e) => [e.exerciseId, e]));

    setPlan((current) =>
      current.map((item) => {
        if (item.day === selectedDay && updatedDayMap.has(item.exerciseId)) {
          return updatedDayMap.get(item.exerciseId)!;
        }
        return item;
      }),
    );

    setBusy(true);
    try {
      await savePlannedExercises(session, updatedDayExercises);
      setNotice("Exercise order updated.");
    } catch (caught) {
      setError(displayError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function moveExercise(currentIndex: number, direction: -1 | 1) {
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= dayPlan.length) return;
    const nextDayPlan = [...dayPlan];
    const [moved] = nextDayPlan.splice(currentIndex, 1);
    if (!moved) return;
    nextDayPlan.splice(targetIndex, 0, moved);
    await reorderExercises(nextDayPlan);
  }

  async function moveExerciseToIndex(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= dayPlan.length ||
      toIndex >= dayPlan.length
    ) {
      return;
    }
    const nextDayPlan = [...dayPlan];
    const [moved] = nextDayPlan.splice(fromIndex, 1);
    if (!moved) return;
    nextDayPlan.splice(toIndex, 0, moved);
    await reorderExercises(nextDayPlan);
  }

  async function deleteExercise(exercise: PlannedExercise) {
    clearFeedback();
    setBusy(true);
    try {
      await removePlannedExercise(session, exercise);
      const remainingDay = dayPlan.filter((item) => item.exerciseId !== exercise.exerciseId);
      const now = new Date().toISOString();
      const updatedRemaining = remainingDay.map((item, index) => ({
        ...item,
        order: index + 1,
        updatedAt: now,
      }));
      const updatedMap = new Map(updatedRemaining.map((e) => [e.exerciseId, e]));
      setPlan((current) =>
        current
          .filter((item) => item.exerciseId !== exercise.exerciseId)
          .map((item) => (updatedMap.has(item.exerciseId) ? updatedMap.get(item.exerciseId)! : item)),
      );
      if (updatedRemaining.length > 0) {
        await savePlannedExercises(session, updatedRemaining).catch(() => undefined);
      }
      setNotice(`${exercise.exerciseName} removed from your plan.`);
    } catch (caught) { setError(displayError(caught)); }
    finally { setBusy(false); }
  }

  function beginWorkout() {
    clearFeedback();
    setDraftSets((current) => {
      const next = { ...current };
      for (const exercise of dayPlan) {
        if (!next[exercise.exerciseId]) next[exercise.exerciseId] = Array.from({ length: exercise.targetSets }, () => ({ reps: "", weight: "" }));
      }
      return next;
    });
    setView("workout");
  }

  async function completeWorkout() {
    clearFeedback();
    const sets: LoggedSet[] = [];
    for (const exercise of dayPlan) {
      const inputSets = draftSets[exercise.exerciseId] ?? [];
      for (let index = 0; index < inputSets.length; index += 1) {
        const item = inputSets[index];
        if (!item || (!item.reps && !item.weight)) continue;
        const reps = Number(item.reps);
        const weight = Number(item.weight);
        if (!Number.isInteger(reps) || reps < 1 || weight < 0 || !Number.isFinite(weight)) {
          setError(`Check the reps and weight for ${exercise.exerciseName}, set ${index + 1}.`);
          return;
        }
        sets.push({ exerciseId: exercise.exerciseId, exerciseName: exercise.exerciseName, setNumber: index + 1, reps, weight, weightUnit: profile.weightUnit, recordedAt: new Date().toISOString(), sessionId: "" });
      }
    }
    if (!sets.length) { setError("Add reps for at least one set before saving the workout."); return; }
    const completedAt = new Date().toISOString();
    const workoutId = createId();
    const workout: WorkoutSession = {
      sessionId: workoutId,
      day: selectedDay,
      startedAt,
      completedAt,
      sets: sets.map((set) => ({ ...set, sessionId: workoutId })),
    };
    setBusy(true);
    try {
      await saveWorkoutSession(session, workout);
      setHistory((current) => [workout, ...current]);
      setView("plan");
      setNotice(`Workout saved. ${sets.length} sets are in your history.`);
    } catch (caught) { setError(displayError(caught)); }
    finally { setBusy(false); }
  }

  async function refreshMemberData() {
    clearFeedback();
    setBusy(true);
    try {
      const fresh = await loadMemberData(session);
      setProfile(fresh.profile ?? createEmptyProfile(session));
      setPlan(fresh.plan);
      setHistory(fresh.history);
      setNotice("Your latest training data is loaded.");
    } catch (caught) { setError(displayError(caught)); }
    finally { setBusy(false); }
  }

  const filteredHistory = history.filter((workout) => historyFilter === "all" || String(workout.day) === historyFilter).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const firstName = profile.name.trim().split(/\s+/)[0] || "Athlete";
  const selectedWeekday = WEEKDAYS[selectedDay] ?? "Monday";

  return (
    <main className="workspace-shell dark min-h-svh bg-background text-foreground">
      <aside className="workspace-rail fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-card px-5 py-7 lg:flex">
        <Wordmark />
        <div className="mt-11 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">TRAINING SPACE</div>
        <nav className="mt-3 space-y-1" aria-label="Main navigation">
          <NavButton icon={<Dumbbell />} label="My plan" active={view === "plan" || view === "workout"} onClick={() => setView("plan")} />
          <NavButton icon={<History />} label="Progress history" active={view === "history"} onClick={() => setView("history")} />
          <NavButton icon={<UserRound />} label="My profile" active={view === "profile"} onClick={() => setView("profile")} />
        </nav>
        <div className="mt-auto border-t border-border pt-5">
          <div className="flex items-center gap-3 px-2 py-2">
            <InitialAvatar name={profile.name} imageUrl={imageUrl} className="size-10 shrink-0 rounded-full text-xs" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{firstName}</div><div className="truncate text-xs text-muted-foreground">Member</div></div>
            <button title="Sign out" aria-label="Sign out" onClick={onSignOut} className="grid size-9 place-items-center text-muted-foreground hover:text-foreground"><LogOut className="size-4" /></button>
          </div>
        </div>
      </aside>

      <header className="workspace-mobile-header sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <Wordmark small />
        <div className="flex items-center gap-2">
          <button onClick={refreshMemberData} title="Refresh your data" aria-label="Refresh your data" className="grid size-10 place-items-center text-muted-foreground hover:text-foreground"><RotateCcw className={`size-[17px] ${busy ? "animate-spin" : ""}`} /></button>
          <button onClick={() => setView("profile")} aria-label="Open profile" className="grid size-9 place-items-center overflow-hidden rounded-full border border-border"><InitialAvatar name={profile.name} imageUrl={imageUrl} className="size-full text-xs" /></button>
        </div>
      </header>

      <section className="workspace-content min-h-svh px-4 pb-28 pt-7 sm:px-7 lg:ml-[248px] lg:px-12 lg:pb-12 lg:pt-11 xl:px-[72px]">
        <div className="mx-auto max-w-[1080px]">
          {notice && <div role="status" className="mb-5 flex items-center gap-2 border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm text-foreground"><Check className="size-4 shrink-0 text-primary" />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message" className="ml-auto grid size-7 place-items-center text-muted-foreground"><X className="size-4" /></button></div>}
          {error && <div role="alert" className="mb-5 flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}<button onClick={() => setError("")} aria-label="Dismiss error" className="ml-auto grid size-7 place-items-center"><X className="size-4" /></button></div>}

          {view === "plan" && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">YOUR TRAINING WEEK</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-[34px]">{fullDate(new Date().toISOString())}</h1><p className="mt-2 text-sm text-muted-foreground">Make each session count, {firstName}.</p></div>
                <Button variant="outline" size="icon" aria-label="Refresh training data" title="Refresh training data" onClick={refreshMemberData} disabled={busy} className="hidden border-border sm:inline-flex"><RotateCcw className={`size-4 ${busy ? "animate-spin" : ""}`} /></Button>
              </div>

              <div className="mt-7 grid grid-cols-2 divide-x divide-border border-y border-border py-4 sm:max-w-[490px]">
                <div className="px-2 sm:px-4"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Activity className="size-3.5 text-primary" />THIS WEEK</div><div className="mt-2 text-2xl font-bold">{weekSessions}<span className="ml-1 text-sm font-medium text-muted-foreground">sessions</span></div></div>
                <div className="px-4"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Sparkles className="size-3.5 text-primary" />TODAY</div><div className="mt-2 text-2xl font-bold">{completedToday}<span className="ml-1 text-sm font-medium text-muted-foreground">workouts</span></div></div>
              </div>

              <div className="mt-8 flex gap-2 overflow-x-auto border-b border-border pb-0 [scrollbar-width:none]">
                {SHORT_DAYS.map((short, index) => <button key={short} onClick={() => { setSelectedDay(index); clearFeedback(); }} className={`relative min-w-[51px] px-2 pb-3 pt-1 text-center text-[11px] font-semibold tracking-[0.06em] transition-colors sm:min-w-[68px] ${selectedDay === index ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} aria-pressed={selectedDay === index}>{short}<span className={`mt-2 block text-base font-bold tracking-normal ${selectedDay === index ? "text-foreground" : ""}`}>{index + 1}</span>{index === todayIndex() && <span className="mx-auto mt-1 block size-1 rounded-full bg-primary" />}{selectedDay === index && <span className="absolute inset-x-1 bottom-0 h-0.5 bg-primary" />}</button>)}
              </div>

              <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
                <div><div className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">{selectedWeekday.toUpperCase()} · {dayPlan.length} EXERCISES</div><h2 className="mt-1.5 text-xl font-bold">Workout plan</h2></div>
                <div className="flex items-center gap-2">
                  {dayPlan.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border text-muted-foreground hover:text-foreground"
                      onClick={() => setShowReorderModal(true)}
                    >
                      <ArrowUpDown className="size-3.5" />
                      Reorder
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="border-border" onClick={() => setShowExercisePicker(true)}><Plus className="size-4" />Add exercise</Button>
                </div>
              </div>

              {dayPlan.length === 0 ? (
                <div className="mt-5 border border-dashed border-border px-5 py-11 text-center sm:py-14">
                  <div className="mx-auto grid size-12 place-items-center border border-border text-primary"><Dumbbell className="size-5" /></div>
                   <h3 className="mt-4 text-lg font-semibold">A fresh start for {selectedWeekday.toLowerCase()}</h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">Add the exercises you want to work on. You can record sets and compare your last session any time.</p>
                  <Button onClick={() => setShowExercisePicker(true)} className="mt-5"><Plus className="size-4" />Add your first exercise</Button>
                </div>
              ) : (
                <div className="mt-4 divide-y divide-border border-y border-border">
                  {dayPlan.map((exercise, index) => {
                    const previous = latestExerciseSets(history, exercise.exerciseId);
                    const previousVolume = previous.reduce((sum, set) => sum + set.reps * convertWeight(set.weight, set.weightUnit, profile.weightUnit), 0);
                    const isDragging = draggedExerciseId === exercise.exerciseId;
                    const isDragTarget = dragOverExerciseId === exercise.exerciseId && draggedExerciseId !== exercise.exerciseId;

                    return <article
                      key={exercise.exerciseId}
                      draggable
                      onDragStart={(event) => {
                        setDraggedExerciseId(exercise.exerciseId);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", exercise.exerciseId);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (dragOverExerciseId !== exercise.exerciseId) {
                          setDragOverExerciseId(exercise.exerciseId);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverExerciseId === exercise.exerciseId) {
                          setDragOverExerciseId(null);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = draggedExerciseId || event.dataTransfer.getData("text/plain");
                        setDraggedExerciseId(null);
                        setDragOverExerciseId(null);
                        if (sourceId && sourceId !== exercise.exerciseId) {
                          const fromIndex = dayPlan.findIndex((item) => item.exerciseId === sourceId);
                          const toIndex = index;
                          if (fromIndex !== -1 && toIndex !== -1) {
                            void moveExerciseToIndex(fromIndex, toIndex);
                          }
                        }
                      }}
                      onDragEnd={() => {
                        setDraggedExerciseId(null);
                        setDragOverExerciseId(null);
                      }}
                      className={`flex items-center gap-2.5 py-4 sm:gap-4 transition-all duration-150 ${
                        isDragging ? "opacity-35 bg-accent/20" : ""
                      } ${isDragTarget ? "border-t-2 border-primary bg-primary/5 pl-2" : ""}`}
                    >
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div
                          title="Drag to reorder"
                          className="hidden sm:grid size-6 place-items-center cursor-grab text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" />
                        </div>
                        <div className="grid size-10 shrink-0 place-items-center border border-border text-xs font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}</div>
                      </div>
                      <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold sm:text-base">{exercise.exerciseName}</h3><p className="mt-1 text-xs text-muted-foreground">{exercise.targetSets} sets <span className="mx-1.5 text-border">·</span>{exercise.targetReps} reps target</p>
                        {previous.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground"><History className="size-3.5 text-primary" />Last time: <span className="font-medium text-foreground">{previous.map((set) => `${set.reps} × ${convertWeight(set.weight, set.weightUnit, profile.weightUnit)} ${profile.weightUnit}`).join("  ·  ")}</span><span>({prettyDate(previous[0]?.recordedAt ?? "")})</span>{previousVolume > 0 && <span className="text-primary">· {Math.round(previousVolume)} {profile.weightUnit} volume</span>}</div>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center border border-border bg-card/60">
                          <button
                            type="button"
                            title="Move up"
                            aria-label={`Move ${exercise.exerciseName} up`}
                            disabled={index === 0 || busy}
                            onClick={() => void moveExercise(index, -1)}
                            className="grid size-8 sm:size-9 place-items-center text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-20 disabled:pointer-events-none transition-colors border-r border-border"
                          >
                            <ChevronUp className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            aria-label={`Move ${exercise.exerciseName} down`}
                            disabled={index === dayPlan.length - 1 || busy}
                            onClick={() => void moveExercise(index, 1)}
                            className="grid size-8 sm:size-9 place-items-center text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                          >
                            <ChevronDown className="size-4" />
                          </button>
                        </div>
                        <button title="Log this exercise" aria-label={`Log ${exercise.exerciseName}`} onClick={() => beginWorkout()} className="grid size-8 sm:size-9 place-items-center border border-border text-primary hover:bg-primary/10"><ArrowRight className="size-4" /></button>
                        <button title="Remove from plan" aria-label={`Remove ${exercise.exerciseName}`} onClick={() => void deleteExercise(exercise)} disabled={busy} className="grid size-8 sm:size-9 place-items-center text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                      </div>
                    </article>;
                  })}
                </div>
              )}

              {dayPlan.length > 0 && <div className="mt-6 flex flex-col items-start justify-between gap-3 border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:px-5"><div><p className="text-sm font-semibold">Ready to get to work?</p><p className="mt-1 text-xs text-muted-foreground">Your last session is waiting in each exercise.</p></div><Button onClick={beginWorkout} className="w-full sm:w-auto">Log this workout <ArrowRight className="size-4" /></Button></div>}
            </>
          )}

          {view === "workout" && (
            <>
              <button onClick={() => { clearFeedback(); setView("plan"); }} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Back to my plan</button>
              <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">SESSION IN PROGRESS</p><h1 className="mt-2 text-3xl font-bold">{WEEKDAYS[selectedDay]} workout</h1><p className="mt-2 text-sm text-muted-foreground">{dayPlan.length} exercises · {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" })}</p></div><span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-primary" />In progress</span></div>
              {dayPlan.length === 0 ? <div className="mt-8 border border-dashed border-border p-8 text-center"><p className="text-sm text-muted-foreground">There are no exercises in this day's plan yet.</p><Button className="mt-4" onClick={() => { setView("plan"); setShowExercisePicker(true); }}><Plus className="size-4" />Add an exercise</Button></div> : <div className="mt-7 divide-y divide-border border-y border-border">
                {dayPlan.map((exercise, index) => {
                  const previous = latestExerciseSets(history, exercise.exerciseId);
                  const currentSets = draftSets[exercise.exerciseId] ?? Array.from({ length: exercise.targetSets }, () => ({ reps: "", weight: "" }));
                  return <section key={exercise.exerciseId} className="py-5 sm:py-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center border border-border text-xs font-bold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                        <div><h2 className="font-semibold">{exercise.exerciseName}</h2><p className="mt-1 text-xs text-muted-foreground">Target · {exercise.targetSets} × {exercise.targetReps}</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        {previous.length > 0 && <span className="hidden sm:block text-right text-[11px] leading-5 text-muted-foreground">LAST TIME<br /><strong className="font-semibold text-foreground">{previous.map((set) => `${set.reps}×${convertWeight(set.weight, set.weightUnit, profile.weightUnit)}`).join(" · ")} {profile.weightUnit}</strong></span>}
                        <div className="flex items-center border border-border bg-card/60">
                          <button
                            type="button"
                            title="Move exercise up"
                            aria-label={`Move ${exercise.exerciseName} up in workout`}
                            disabled={index === 0 || busy}
                            onClick={() => void moveExercise(index, -1)}
                            className="grid size-8 place-items-center text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-20 disabled:pointer-events-none transition-colors border-r border-border"
                          >
                            <ChevronUp className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="Move exercise down"
                            aria-label={`Move ${exercise.exerciseName} down in workout`}
                            disabled={index === dayPlan.length - 1 || busy}
                            onClick={() => void moveExercise(index, 1)}
                            className="grid size-8 place-items-center text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                          >
                            <ChevronDown className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-[48px_1fr_1fr] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"><span>Set</span><span>Reps</span><span>Weight · {profile.weightUnit}</span></div>
                    <div className="mt-2 space-y-2">{currentSets.map((set, setIndex) => <div key={`${exercise.exerciseId}-${setIndex}`} className="grid grid-cols-[48px_1fr_1fr] items-center gap-2">
                      <span className="grid h-10 place-items-center border border-border text-xs font-semibold text-muted-foreground">{String(setIndex + 1).padStart(2, "0")}</span>
                      <Input type="number" inputMode="numeric" min="1" step="1" placeholder={String(exercise.targetReps)} aria-label={`${exercise.exerciseName} set ${setIndex + 1} reps`} value={set.reps} onChange={(event) => setDraftSets((current) => ({ ...current, [exercise.exerciseId]: currentSets.map((item, i) => i === setIndex ? { ...item, reps: event.target.value } : item) }))} className="h-10 border-border bg-input/35 text-center text-sm tabular-nums" />
                      <Input type="number" inputMode="decimal" min="0" step="0.5" placeholder="0" aria-label={`${exercise.exerciseName} set ${setIndex + 1} weight in ${profile.weightUnit}`} value={set.weight} onChange={(event) => setDraftSets((current) => ({ ...current, [exercise.exerciseId]: currentSets.map((item, i) => i === setIndex ? { ...item, weight: event.target.value } : item) }))} className="h-10 border-border bg-input/35 text-center text-sm tabular-nums" />
                    </div>)}</div>
                    <button className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80" onClick={() => setDraftSets((current) => ({ ...current, [exercise.exerciseId]: [...currentSets, { reps: "", weight: "" }] }))}><Plus className="size-3.5" />Add set</button>
                  </section>;
                })}
              </div>}
              {dayPlan.length > 0 && <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="outline" className="border-border" onClick={() => setView("plan")}>Keep editing later</Button><Button disabled={busy} onClick={() => void completeWorkout()} className="sm:min-w-[190px]"><Check className="size-4" />{busy ? "Saving workout…" : "Finish workout"}</Button></div>}
            </>
          )}

          {view === "history" && (
            <>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">YOUR WORK, OVER TIME</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Progress history</h1><p className="mt-2 text-sm text-muted-foreground">Every session is proof you're moving forward.</p></div>
              <div className="mt-7 grid grid-cols-3 divide-x divide-border border-y border-border py-4">
                <div className="px-2 sm:px-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SESSIONS</p><p className="mt-1 text-2xl font-bold">{history.length}</p></div>
                <div className="px-3 sm:px-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SETS LOGGED</p><p className="mt-1 text-2xl font-bold">{history.reduce((sum, workout) => sum + workout.sets.length, 0)}</p></div>
                <div className="px-3 sm:px-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">THIS WEEK</p><p className="mt-1 text-2xl font-bold">{weekSessions}</p></div>
              </div>
              <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Your sessions</h2><label className="relative"><span className="sr-only">Filter sessions by day</span><select value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} className="h-9 appearance-none border border-border bg-card pl-3 pr-8 text-xs font-medium text-foreground"><option value="all">All days</option>{WEEKDAYS.map((day, index) => <option key={day} value={String(index)}>{day}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3.5 text-muted-foreground" /></label></div>
              {filteredHistory.length === 0 ? <div className="mt-4 border border-dashed border-border px-5 py-12 text-center"><div className="mx-auto grid size-12 place-items-center border border-border text-primary"><History className="size-5" /></div><h3 className="mt-4 font-semibold">Your first session is waiting</h3><p className="mt-1.5 text-sm text-muted-foreground">Complete a workout and it'll appear here with every set.</p><Button variant="outline" onClick={() => setView("plan")} className="mt-4 border-border">Back to my plan <ArrowRight className="size-4" /></Button></div> : <div className="mt-4 divide-y divide-border border-y border-border">{filteredHistory.map((workout) => {
                const uniqueExercises = [...new Set(workout.sets.map((set) => set.exerciseId))];
                return <article key={workout.sessionId} className="py-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{WEEKDAYS[workout.day]} session</h3><p className="mt-1 text-xs text-muted-foreground">{fullDate(workout.completedAt)} · {workout.sets.length} sets</p></div><span className="border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">Completed</span></div><div className="mt-4 divide-y divide-border/70">{uniqueExercises.map((exerciseId) => {
                  const exerciseSets = workout.sets.filter((set) => set.exerciseId === exerciseId).sort((a, b) => a.setNumber - b.setNumber);
                  const name = exerciseSets[0]?.exerciseName ?? "Exercise";
                  const earlier = latestExerciseSets(history.filter((item) => item.completedAt < workout.completedAt), exerciseId);
                  const currentVolume = exerciseSets.reduce((sum, set) => sum + set.reps * convertWeight(set.weight, set.weightUnit, profile.weightUnit), 0);
                  const oldVolume = earlier.reduce((sum, set) => sum + set.reps * convertWeight(set.weight, set.weightUnit, profile.weightUnit), 0);
                  return <div key={exerciseId} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-[145px] flex-1"><div className="text-sm font-medium">{name}</div><div className="mt-1 text-xs text-muted-foreground">{exerciseSets.map((set) => `${set.reps} × ${convertWeight(set.weight, set.weightUnit, profile.weightUnit)} ${profile.weightUnit}`).join("  ·  ")}</div></div>{oldVolume > 0 && <span className={`inline-flex items-center gap-1 text-xs font-semibold ${currentVolume >= oldVolume ? "text-primary" : "text-muted-foreground"}`}>{currentVolume >= oldVolume ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{currentVolume >= oldVolume ? "+" : ""}{Math.round(currentVolume - oldVolume)} {profile.weightUnit} volume</span>}</div>;
                })}</div></article>;
              })}</div>}
            </>
          )}

          {view === "profile" && (
            <>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">YOUR ACCOUNT</p><h1 className="mt-2 text-3xl font-bold tracking-tight">My profile</h1><p className="mt-2 text-sm text-muted-foreground">Keep your member details and measurements up to date.</p></div>
              <div className="mt-7 border-y border-border py-6">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="grid size-[76px] shrink-0 place-items-center overflow-hidden rounded-full border border-border"><InitialAvatar name={profile.name} imageUrl={imageUrl} className="size-full text-lg" /></span>
                  <div className="flex-1"><p className="text-sm font-semibold">Profile photo</p><p className="mt-1 text-xs text-muted-foreground">Choose a clear image, up to 5 MB.</p><label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 border border-border px-3 text-xs font-medium hover:bg-accent/50"><ImagePlus className="size-4 text-primary" />{busy ? "Uploading…" : "Change photo"}<input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(event) => { void uploadPhoto(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
                </div>
              </div>
              <div className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <label className="space-y-1.5"><span className="text-sm font-medium">Full name</span><Input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} placeholder="Your name" autoComplete="name" className="h-11 border-border bg-input/35" /></label>
                <label className="space-y-1.5"><span className="text-sm font-medium">Email</span><Input type="email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" autoComplete="email" className="h-11 border-border bg-input/35" /></label>
                <label className="space-y-1.5"><span className="text-sm font-medium">Phone</span><Input type="tel" value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} placeholder="+1 415 555 0123" autoComplete="tel" className="h-11 border-border bg-input/35" /></label>
                <label className="space-y-1.5"><span className="text-sm font-medium">Height <span className="text-muted-foreground">(cm)</span></span><Input type="number" min="1" max="280" inputMode="decimal" value={profile.heightCm ?? ""} onChange={(event) => setProfile((current) => ({ ...current, heightCm: event.target.value ? Number(event.target.value) : null }))} placeholder="e.g. 175" className="h-11 border-border bg-input/35" /></label>
                <div className="space-y-1.5"><span className="text-sm font-medium">Current weight</span><div className="flex gap-2"><Input type="number" min="0" step="0.1" inputMode="decimal" value={profile.bodyWeight ?? ""} onChange={(event) => setProfile((current) => ({ ...current, bodyWeight: event.target.value ? Number(event.target.value) : null }))} placeholder="e.g. 72.5" className="h-11 flex-1 border-border bg-input/35" /><div className="flex border border-border p-1" role="group" aria-label="Preferred weight unit">{(["kg", "lb"] as WeightUnit[]).map((unit) => <button key={unit} type="button" onClick={() => setProfile((current) => ({ ...current, bodyWeight: current.bodyWeight === null ? null : convertWeight(current.bodyWeight, current.weightUnit, unit), weightUnit: unit }))} aria-pressed={profile.weightUnit === unit} className={`min-w-11 px-2 text-sm font-semibold ${profile.weightUnit === unit ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{unit}</button>)}</div></div></div>
              </div>
              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><button onClick={onSignOut} className="flex h-10 items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:justify-start"><LogOut className="size-4" />Sign out</button><Button onClick={() => void saveProfile()} disabled={busy} className="sm:min-w-[155px]"><Save className="size-4" />{busy ? "Saving…" : "Save profile"}</Button></div>
            </>
          )}
        </div>
      </section>

      <nav className="workspace-bottom-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main navigation">
        <MobileNavButton icon={<Dumbbell />} label="Plan" active={view === "plan" || view === "workout"} onClick={() => setView("plan")} />
        <MobileNavButton icon={<History />} label="History" active={view === "history"} onClick={() => setView("history")} />
        <MobileNavButton icon={<UserRound />} label="Profile" active={view === "profile"} onClick={() => setView("profile")} />
      </nav>

      {showReorderModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowReorderModal(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reorder-modal-title"
            className="w-full max-w-lg border border-border bg-card p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">CUSTOMIZE ORDER</p>
                <h2 id="reorder-modal-title" className="mt-1 text-xl font-bold">Set exercise order</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {WEEKDAYS[selectedDay]} · {dayPlan.length} exercises
                </p>
              </div>
              <button
                onClick={() => setShowReorderModal(false)}
                aria-label="Close reorder modal"
                className="grid size-9 place-items-center text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Position exercises in your preferred sequence. Choose a slot number or click the arrows to move exercises up and down.
            </p>

            <div className="mt-4 max-h-[min(50vh,380px)] overflow-y-auto divide-y divide-border border-y border-border">
              {dayPlan.map((exercise, index) => (
                <div key={exercise.exerciseId} className="flex items-center justify-between gap-2.5 py-3 px-1">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="grid size-8 shrink-0 place-items-center border border-border text-xs font-bold text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{exercise.exerciseName}</p>
                      <p className="text-xs text-muted-foreground">
                        {exercise.targetSets} sets · {exercise.targetReps} reps
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <label className="sr-only" htmlFor={`pos-select-${exercise.exerciseId}`}>
                      Position for {exercise.exerciseName}
                    </label>
                    <select
                      id={`pos-select-${exercise.exerciseId}`}
                      value={index + 1}
                      onChange={(e) => {
                        const targetPos = Number(e.target.value) - 1;
                        void moveExerciseToIndex(index, targetPos);
                      }}
                      disabled={busy}
                      aria-label={`Position of ${exercise.exerciseName}`}
                      className="h-8 rounded border border-border bg-background px-1.5 text-xs font-semibold text-foreground"
                    >
                      {dayPlan.map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          #{i + 1}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      title="Move to top"
                      aria-label={`Move ${exercise.exerciseName} to top`}
                      disabled={index === 0 || busy}
                      onClick={() => void moveExerciseToIndex(index, 0)}
                      className="grid size-8 place-items-center border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-20 transition-colors"
                    >
                      <ChevronsUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Move up"
                      aria-label={`Move ${exercise.exerciseName} up`}
                      disabled={index === 0 || busy}
                      onClick={() => void moveExercise(index, -1)}
                      className="grid size-8 place-items-center border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      aria-label={`Move ${exercise.exerciseName} down`}
                      disabled={index === dayPlan.length - 1 || busy}
                      onClick={() => void moveExercise(index, 1)}
                      className="grid size-8 place-items-center border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Move to bottom"
                      aria-label={`Move ${exercise.exerciseName} to bottom`}
                      disabled={index === dayPlan.length - 1 || busy}
                      onClick={() => void moveExerciseToIndex(index, dayPlan.length - 1)}
                      className="grid size-8 place-items-center border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-20 transition-colors"
                    >
                      <ChevronsDown className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <Button onClick={() => setShowReorderModal(false)} className="w-full sm:w-auto">
                Done
              </Button>
            </div>
          </section>
        </div>
      )}

      {showExercisePicker && <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/75 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowExercisePicker(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="exercise-picker-title" className="w-full max-w-lg border border-border bg-card p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">BUILD YOUR SESSION</p><h2 id="exercise-picker-title" className="mt-1 text-xl font-bold">Add an exercise</h2><p className="mt-1 text-xs text-muted-foreground">{WEEKDAYS[selectedDay]} · 3 sets · 10 rep target</p></div><button onClick={() => setShowExercisePicker(false)} aria-label="Close exercise picker" className="grid size-9 place-items-center text-muted-foreground hover:text-foreground"><X className="size-5" /></button></div>
          <label className="mt-5 block"><span className="sr-only">Search exercises</span><Input autoFocus value={exerciseSearch} onChange={(event) => setExerciseSearch(event.target.value)} placeholder="Search exercises" className="h-10 border-border bg-input/35" /></label>
          <div className="mt-3 max-h-[min(36vh,290px)] overflow-y-auto divide-y divide-border border-y border-border">{exerciseSuggestions.filter((name) => name.toLowerCase().includes(exerciseSearch.trim().toLowerCase())).map((name) => <button key={name} onClick={() => void addExercise(name)} disabled={busy} className="flex min-h-11 w-full items-center justify-between px-1 text-left text-sm hover:text-primary"><span>{name}</span><Plus className="size-4 shrink-0 text-muted-foreground" /></button>)}{exerciseSuggestions.filter((name) => name.toLowerCase().includes(exerciseSearch.trim().toLowerCase())).length === 0 && <p className="py-4 text-sm text-muted-foreground">No match yet. Add it below.</p>}</div>
          <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void addExercise(customExercise || exerciseSearch); }}><Input value={customExercise} onChange={(event) => setCustomExercise(event.target.value)} placeholder="Add a custom exercise" className="h-10 border-border bg-input/35" /><Button type="submit" disabled={busy || !(customExercise.trim() || exerciseSearch.trim())} size="sm" className="h-10"><Plus className="size-4" />Add</Button></form>
        </section>
      </div>}
    </main>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex h-11 w-full items-center gap-3 px-3 text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}>{icon}<span>{label}</span></button>;
}

function MobileNavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1.5 text-[10px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>{icon}<span>{label}</span></button>;
}

export default function GymApp() {
  const [session, setSession] = useState<MemberSession | null>(null);
  const [workspaceData, setWorkspaceData] = useState<{ profile: GymProfile; plan: PlannedExercise[]; history: WorkoutSession[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");

  async function activateSession(memberSession: MemberSession) {
    setSession(memberSession);
    setLoading(true);
    setStartupError("");
    try {
      const data = await loadMemberData(memberSession);
      const profile = data.profile ?? createEmptyProfile(memberSession);
      if (!data.profile) await saveMemberProfile(memberSession, profile);
      setWorkspaceData({ profile, plan: data.plan, history: data.history });
    } catch (caught) {
      setSession(null);
      clearSavedMemberSession();
      setStartupError(displayError(caught));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const oauthSession = await completeGoogleSignIn(window.location.search);
        if (oauthSession && active) { await activateSession(oauthSession); return; }
      } catch (caught) {
        if (active) setStartupError(displayError(caught));
      }
      const saved = getSavedMemberSession();
      if (saved && active) await activateSession(saved);
      else if (active) setLoading(false);
    };
    void boot();
    return () => { active = false; };
  }, []);

  function signOut() {
    clearSavedMemberSession();
    setSession(null);
    setWorkspaceData(null);
    setStartupError("");
  }

  if (loading) return <main className="dark grid min-h-svh place-items-center bg-background"><div className="flex flex-col items-center gap-3 text-muted-foreground"><span className="grid size-12 place-items-center bg-primary text-primary-foreground"><Dumbbell className="size-5" /></span><span className="text-xs font-semibold uppercase tracking-[0.15em]">IRONPATH</span><span className="text-sm">Loading your training space…</span></div></main>;

  if (!session || !workspaceData) return <><AuthScreen onSignedIn={activateSession} />{startupError && <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive shadow-lg">{startupError}</div>}</>;

  return <GymWorkspace session={session} initialProfile={workspaceData.profile} initialPlan={workspaceData.plan} initialHistory={workspaceData.history} onSignOut={signOut} />;
}

import trainingPhoto from "@/assets/gym-training-photo.jpg";