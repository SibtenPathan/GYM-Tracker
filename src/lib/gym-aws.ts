import {
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";

export type WeightUnit = "kg" | "lb";
export type SignInMethod = "email" | "phone";

export interface GymProfile {
  name: string;
  email: string;
  phone: string;
  heightCm: number | null;
  bodyWeight: number | null;
  weightUnit: WeightUnit;
  avatarKey: string;
  updatedAt: string;
}

export interface PlannedExercise {
  day: number;
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  targetReps: number;
  order?: number;
  createdAt?: string;
  updatedAt: string;
}

export interface LoggedSet {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weight: number;
  weightUnit: WeightUnit;
  recordedAt: string;
  sessionId: string;
}

export interface WorkoutSession {
  sessionId: string;
  day: number;
  startedAt: string;
  completedAt: string;
  sets: LoggedSet[];
}

export interface MemberSession {
  identityId: string;
  sub: string;
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  email: string;
  phone: string;
  expiresAt: number;
}

interface AwsAppConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  identityPoolId: string;
  tableName: string;
  bucketName: string;
  hostedUiDomain: string;
}

interface MemberContext {
  identityId: string;
  doc: DynamoDBDocumentClient;
  s3: S3Client;
}

const SESSION_STORAGE_KEY = "ironpath-member-session";
const OAUTH_STATE_KEY = "ironpath-oauth-state";
const OAUTH_VERIFIER_KEY = "ironpath-oauth-verifier";

export function getAwsAppConfig(): AwsAppConfig | null {
  const {
    VITE_AWS_REGION,
    VITE_COGNITO_USER_POOL_ID,
    VITE_COGNITO_USER_POOL_CLIENT_ID,
    VITE_COGNITO_IDENTITY_POOL_ID,
    VITE_DYNAMODB_TABLE_NAME,
    VITE_S3_AVATAR_BUCKET_NAME,
    VITE_COGNITO_HOSTED_UI_DOMAIN,
  } = import.meta.env;

  if (
    !VITE_AWS_REGION ||
    !VITE_COGNITO_USER_POOL_ID ||
    !VITE_COGNITO_USER_POOL_CLIENT_ID ||
    !VITE_COGNITO_IDENTITY_POOL_ID ||
    !VITE_DYNAMODB_TABLE_NAME ||
    !VITE_S3_AVATAR_BUCKET_NAME
  ) {
    return null;
  }

  return {
    region: VITE_AWS_REGION,
    userPoolId: VITE_COGNITO_USER_POOL_ID,
    userPoolClientId: VITE_COGNITO_USER_POOL_CLIENT_ID,
    identityPoolId: VITE_COGNITO_IDENTITY_POOL_ID,
    tableName: VITE_DYNAMODB_TABLE_NAME,
    bucketName: VITE_S3_AVATAR_BUCKET_NAME,
    hostedUiDomain: VITE_COGNITO_HOSTED_UI_DOMAIN ?? "",
  };
}

function getUserPoolClient(): CognitoIdentityProviderClient {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  return new CognitoIdentityProviderClient({ region: config.region });
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, "");
}

function phoneIsValid(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(phone));
}

export function getMemberSubject(idToken: string): string {
  const [, payload] = idToken.split(".");
  if (!payload) throw new Error("Sign-in returned an unreadable member token.");
  const encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
  const claims = JSON.parse(atob(encoded)) as { sub?: string };
  if (!claims.sub) throw new Error("Sign-in returned no member identifier.");
  return claims.sub;
}

export function getSavedMemberSession(): MemberSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MemberSession) : null;
  } catch {
    return null;
  }
}

export function clearSavedMemberSession(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function saveMemberSession(session: MemberSession): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}

export function toCognitoUsername(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return `u_${trimmed.toLowerCase().replace(/@/g, "_at_").replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  }
  if (trimmed.startsWith("+")) {
    return `p_${normalizePhone(trimmed).replace(/^\+/, "")}`;
  }
  return trimmed;
}

export async function signUpMember(input: {
  method: SignInMethod;
  email: string;
  phone: string;
  password: string;
}): Promise<void> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("Add your AWS stack values to the app configuration first.");

  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone.trim());
  const identifier = input.method === "email" ? email : phone;
  if (input.method === "email" && !email) throw new Error("Enter your email address.");
  if (input.method === "phone" && !phoneIsValid(phone)) {
    throw new Error("Enter a phone number in international format, such as +14155550123.");
  }
  if (input.password.length < 8) throw new Error("Choose a password with at least 8 characters.");

  const attributes = input.method === "email"
    ? [{ Name: "email", Value: email }]
    : [{ Name: "phone_number", Value: phone }];

  await getUserPoolClient().send(new SignUpCommand({
    ClientId: config.userPoolClientId,
    Username: toCognitoUsername(identifier),
    Password: input.password,
    UserAttributes: attributes,
  }));
}

export async function confirmMemberSignUp(identifier: string, code: string): Promise<void> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  await getUserPoolClient().send(new ConfirmSignUpCommand({
    ClientId: config.userPoolClientId,
    Username: toCognitoUsername(identifier),
    ConfirmationCode: code.trim(),
  }));
}

export async function resendMemberConfirmation(identifier: string): Promise<void> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  await getUserPoolClient().send(new ResendConfirmationCodeCommand({
    ClientId: config.userPoolClientId,
    Username: toCognitoUsername(identifier),
  }));
}

export async function signInMember(input: {
  identifier: string;
  password: string;
}): Promise<MemberSession> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("Add your AWS stack values to the app configuration first.");
  const rawIdentifier = input.identifier.trim();
  const identifier = rawIdentifier.includes("@") ? rawIdentifier.toLowerCase() : normalizePhone(rawIdentifier);
  const response = await getUserPoolClient().send(new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: config.userPoolClientId,
    AuthParameters: { USERNAME: identifier, PASSWORD: input.password },
  }));
  const result = response.AuthenticationResult;
  if (!result?.IdToken || !result.AccessToken) {
    throw new Error("Sign-in could not be completed. Check your details or confirm your account.");
  }

  const claims = decodeClaims(result.IdToken);
  const session: MemberSession = {
    identityId: "",
    sub: claims.sub ?? "",
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    ...(result.RefreshToken ? { refreshToken: result.RefreshToken } : {}),
    email: claims.email ?? (identifier.includes("@") ? identifier : ""),
    phone: claims.phone_number ?? (!identifier.includes("@") ? identifier : ""),
    expiresAt: Date.now() + (result.ExpiresIn ?? 3600) * 1000,
  };
  if (!session.sub) throw new Error("Sign-in returned no member identifier.");

  const context = await getMemberContext(session);
  session.identityId = context.identityId;
  saveMemberSession(session);
  return session;
}

function decodeClaims(idToken: string): {
  sub?: string;
  email?: string;
  phone_number?: string;
} {
  const [, payload] = idToken.split(".");
  if (!payload) throw new Error("Sign-in returned an unreadable member token.");
  const encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(encoded)) as { sub?: string; email?: string; phone_number?: string };
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  await getUserPoolClient().send(new ForgotPasswordCommand({
    ClientId: config.userPoolClientId,
    Username: toCognitoUsername(identifier),
  }));
}

export async function resetMemberPassword(input: {
  identifier: string;
  code: string;
  password: string;
}): Promise<void> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  if (input.password.length < 8) throw new Error("Choose a password with at least 8 characters.");
  await getUserPoolClient().send(new ConfirmForgotPasswordCommand({
    ClientId: config.userPoolClientId,
    Username: toCognitoUsername(input.identifier),
    ConfirmationCode: input.code.trim(),
    Password: input.password,
  }));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function startGoogleSignIn(): Promise<void> {
  const config = getAwsAppConfig();
  if (!config || !config.hostedUiDomain) {
    throw new Error("Add the Cognito hosted sign-in domain to your app configuration first.");
  }
  const random = crypto.getRandomValues(new Uint8Array(48));
  const verifier = base64Url(random);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  )));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  window.sessionStorage.setItem(OAUTH_STATE_KEY, state);
  window.sessionStorage.setItem(OAUTH_VERIFIER_KEY, verifier);

  const redirectUri = `${window.location.origin}/`;
  const authorizationUrl = new URL(`https://${config.hostedUiDomain}/oauth2/authorize`);
  authorizationUrl.search = new URLSearchParams({
    client_id: config.userPoolClientId,
    response_type: "code",
    scope: "openid email phone",
    redirect_uri: redirectUri,
    identity_provider: "Google",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  window.location.assign(authorizationUrl.toString());
}

export async function completeGoogleSignIn(search: string): Promise<MemberSession | null> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  if (!code) return null;

  const config = getAwsAppConfig();
  if (!config || !config.hostedUiDomain) throw new Error("Cognito hosted sign-in is not configured.");
  const expectedState = window.sessionStorage.getItem(OAUTH_STATE_KEY);
  const state = params.get("state");
  const verifier = window.sessionStorage.getItem(OAUTH_VERIFIER_KEY);
  window.sessionStorage.removeItem(OAUTH_STATE_KEY);
  window.sessionStorage.removeItem(OAUTH_VERIFIER_KEY);
  if (!expectedState || !state || state !== expectedState || !verifier) {
    throw new Error("Google sign-in could not be verified. Please try again.");
  }

  const tokenResponse = await fetch(`https://${config.hostedUiDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.userPoolClientId,
      code,
      redirect_uri: `${window.location.origin}/`,
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw new Error(`Google sign-in was not accepted (${tokenResponse.status}). ${body.slice(0, 180)}`);
  }
  const tokens = await tokenResponse.json() as {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokens.id_token || !tokens.access_token) throw new Error("Google sign-in returned no member session.");
  const claims = decodeClaims(tokens.id_token);
  if (!claims.sub) throw new Error("Google sign-in returned no member identifier.");
  const session: MemberSession = {
    identityId: "",
    sub: claims.sub,
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    email: claims.email ?? "",
    phone: claims.phone_number ?? "",
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  };
  const context = await getMemberContext(session);
  session.identityId = context.identityId;
  saveMemberSession(session);
  window.history.replaceState({}, "", window.location.pathname);
  return session;
}

async function refreshMemberSession(session: MemberSession): Promise<MemberSession> {
  if (session.expiresAt > Date.now() + 60_000) return session;
  if (!session.refreshToken) throw new Error("Your session has expired. Please sign in again.");
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  const response = await getUserPoolClient().send(new InitiateAuthCommand({
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: config.userPoolClientId,
    AuthParameters: { REFRESH_TOKEN: session.refreshToken },
  }));
  const result = response.AuthenticationResult;
  if (!result?.IdToken || !result.AccessToken) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  const refreshed: MemberSession = {
    ...session,
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    ...(result.RefreshToken ? { refreshToken: result.RefreshToken } : {}),
    expiresAt: Date.now() + (result.ExpiresIn ?? 3600) * 1000,
  };
  saveMemberSession(refreshed);
  return refreshed;
}

function getIdentityProvider(session: MemberSession) {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  const logins = {
    [`cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`]: session.idToken,
  };
  return fromCognitoIdentityPool({
    identityPoolId: config.identityPoolId,
    logins,
    userIdentifier: session.sub,
    clientConfig: { region: config.region },
  });
}

async function getMemberContext(session: MemberSession): Promise<MemberContext> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  const currentSession = await refreshMemberSession(session);
  const credentials = getIdentityProvider(currentSession);
  const identity = await credentials();
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: config.region,
    credentials,
  }));
  const s3 = new S3Client({ region: config.region, credentials });
  return { identityId: identity.identityId, doc, s3 };
}

function requireStableIdentity(session: MemberSession, context: MemberContext): void {
  if (session.identityId && session.identityId !== context.identityId) {
    throw new Error("This session changed identity. Sign in again to protect your saved data.");
  }
}

function getTableName(): string {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  return config.tableName;
}

export async function loadMemberData(session: MemberSession): Promise<{
  profile: GymProfile | null;
  plan: PlannedExercise[];
  history: WorkoutSession[];
}> {
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  const tableName = getTableName();
  const [profileResult, planResult, historyResult, setsResult] = await Promise.all([
    context.doc.send(new GetCommand({
      TableName: tableName,
      Key: { PK: context.identityId, SK: "PROFILE" },
    })),
    context.doc.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": context.identityId, ":prefix": "PLAN#" },
    })),
    context.doc.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": context.identityId, ":prefix": "SESSION#" },
      ScanIndexForward: false,
      Limit: 40,
    })),
    context.doc.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: { ":pk": context.identityId, ":prefix": "SET#" },
      ScanIndexForward: false,
      Limit: 300,
    })),
  ]);
  const profile = profileResult.Item?.["record"] as GymProfile | undefined;
  const plan = (planResult.Items ?? []).map((item) => item["record"] as PlannedExercise);
  const sets = (setsResult.Items ?? []).map((item) => item["record"] as LoggedSet);
  const setsBySession = new Map<string, LoggedSet[]>();
  for (const set of sets) {
    const sessionSets = setsBySession.get(set.sessionId) ?? [];
    sessionSets.push(set);
    setsBySession.set(set.sessionId, sessionSets);
  }
  const history = (historyResult.Items ?? []).map((item) => {
    const record = item["record"] as Omit<WorkoutSession, "sets">;
    return { ...record, sets: setsBySession.get(record.sessionId) ?? [] };
  });
  return { profile: profile ?? null, plan, history };
}

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  const converted = from === "kg" ? value * 2.2046226218 : value / 2.2046226218;
  return Math.round(converted * 10) / 10;
}

export function latestExerciseSets(
  history: WorkoutSession[],
  exerciseId: string,
): LoggedSet[] {
  const sorted = [...history].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  for (const workout of sorted) {
    const sets = workout.sets
      .filter((set) => set.exerciseId === exerciseId)
      .sort((a, b) => a.setNumber - b.setNumber);
    if (sets.length) return sets;
  }
  return [];
}

export async function saveMemberProfile(session: MemberSession, profile: GymProfile): Promise<void> {
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  await context.doc.send(new PutCommand({
    TableName: getTableName(),
    Item: { PK: context.identityId, SK: "PROFILE", record: profile },
  }));
}

export function sortPlannedExercises(exercises: PlannedExercise[]): PlannedExercise[] {
  return [...exercises].sort((a, b) => {
    const orderA = typeof a.order === "number" ? a.order : undefined;
    const orderB = typeof b.order === "number" ? b.order : undefined;
    if (orderA !== undefined && orderB !== undefined) {
      if (orderA !== orderB) return orderA - orderB;
    } else if (orderA !== undefined) {
      return -1;
    } else if (orderB !== undefined) {
      return 1;
    }
    const timeA = a.createdAt || a.updatedAt || "";
    const timeB = b.createdAt || b.updatedAt || "";
    if (timeA && timeB && timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }
    return 0;
  });
}

export async function savePlannedExercise(
  session: MemberSession,
  exercise: PlannedExercise,
): Promise<void> {
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  await context.doc.send(new PutCommand({
    TableName: getTableName(),
    Item: {
      PK: context.identityId,
      SK: `PLAN#${exercise.day}#${exercise.exerciseId}`,
      record: exercise,
    },
  }));
}

export async function savePlannedExercises(
  session: MemberSession,
  exercises: PlannedExercise[],
): Promise<void> {
  if (exercises.length === 0) return;
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  const tableName = getTableName();
  await Promise.all(
    exercises.map((exercise) =>
      context.doc.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: context.identityId,
          SK: `PLAN#${exercise.day}#${exercise.exerciseId}`,
          record: exercise,
        },
      }))
    )
  );
}

export async function removePlannedExercise(
  session: MemberSession,
  exercise: PlannedExercise,
): Promise<void> {
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  await context.doc.send(new DeleteCommand({
    TableName: getTableName(),
    Key: { PK: context.identityId, SK: `PLAN#${exercise.day}#${exercise.exerciseId}` },
  }));
}

export async function loadExerciseHistory(
  session: MemberSession,
  exerciseId: string,
): Promise<LoggedSet[]> {
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  const response = await context.doc.send(new QueryCommand({
    TableName: getTableName(),
    IndexName: "ExerciseHistoryIndex",
    ExpressionAttributeValues: {
      ":gsiPk": context.identityId,
      ":exercisePrefix": `${exerciseId}#`,
    },
    KeyConditionExpression: "GSI1PK = :gsiPk AND begins_with(GSI1SK, :exercisePrefix)",
    ScanIndexForward: false,
    Limit: 16,
  }));
  return (response.Items ?? []).map((item) => item["record"] as LoggedSet);
}

export async function saveWorkoutSession(
  session: MemberSession,
  workout: WorkoutSession,
): Promise<void> {
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  if (workout.sets.length > 99) throw new Error("A workout can save up to 99 sets at once.");
  const client = context.doc;
  const transactItems = [
    {
      Put: {
        TableName: getTableName(),
        Item: {
          PK: context.identityId,
          SK: `SESSION#${workout.completedAt}#${workout.sessionId}`,
          record: {
            sessionId: workout.sessionId,
            day: workout.day,
            startedAt: workout.startedAt,
            completedAt: workout.completedAt,
            exerciseIds: [...new Set(workout.sets.map((set) => set.exerciseId))],
            setCount: workout.sets.length,
          },
        },
      },
    },
    ...workout.sets.map((set) => ({
      Put: {
        TableName: getTableName(),
        Item: {
          PK: context.identityId,
          SK: `SET#${set.exerciseId}#${workout.completedAt}#${workout.sessionId}#${String(set.setNumber).padStart(2, "0")}`,
          GSI1PK: context.identityId,
          GSI1SK: `${set.exerciseId}#${workout.completedAt}#${workout.sessionId}#${String(set.setNumber).padStart(2, "0")}`,
          record: set,
        },
      },
    })),
  ];
  const { TransactWriteCommand } = await import("@aws-sdk/lib-dynamodb");
  await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
}

export async function uploadProfilePhoto(
  session: MemberSession,
  file: File,
): Promise<{ key: string; imageUrl: string }> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  const key = `${context.identityId}/avatar-${crypto.randomUUID()}`;
  await context.s3.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: file,
    ContentType: file.type,
  }));
  const result = await context.s3.send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error("The photo uploaded, but could not be previewed.");
  const blob = new Blob([new Uint8Array(bytes)], { type: file.type });
  return { key, imageUrl: URL.createObjectURL(blob) };
}

export async function loadProfilePhoto(
  session: MemberSession,
  key: string,
): Promise<string | null> {
  if (!key) return null;
  const config = getAwsAppConfig();
  if (!config) return null;
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  const result = await context.s3.send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) return null;
  const blob = new Blob([new Uint8Array(bytes)], { type: result.ContentType ?? "image/jpeg" });
  return URL.createObjectURL(blob);
}

export async function deleteProfilePhoto(session: MemberSession, key: string): Promise<void> {
  const config = getAwsAppConfig();
  if (!config) throw new Error("AWS app configuration is incomplete.");
  const context = await getMemberContext(session);
  requireStableIdentity(session, context);
  await context.s3.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}