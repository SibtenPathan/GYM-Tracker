import { describe, expect, it } from "vitest";
import { sortPlannedExercises, type PlannedExercise } from "@/lib/gym-aws";

describe("sortPlannedExercises", () => {
  it("does not sort alphabetically and preserves entry order by creation timestamp", () => {
    const exercises: PlannedExercise[] = [
      {
        day: 0,
        exerciseId: "ex-1",
        exerciseName: "Squat",
        targetSets: 3,
        targetReps: 10,
        createdAt: "2026-10-12T10:00:00.000Z",
        updatedAt: "2026-10-12T10:00:00.000Z",
      },
      {
        day: 0,
        exerciseId: "ex-2",
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: 10,
        createdAt: "2026-10-12T10:05:00.000Z",
        updatedAt: "2026-10-12T10:05:00.000Z",
      },
      {
        day: 0,
        exerciseId: "ex-3",
        exerciseName: "Arm Curl",
        targetSets: 3,
        targetReps: 10,
        createdAt: "2026-10-12T10:10:00.000Z",
        updatedAt: "2026-10-12T10:10:00.000Z",
      },
    ];

    const sorted = sortPlannedExercises(exercises);

    // In alphabetical sorting, Arm Curl would come first.
    // In entered order, Squat was entered first, then Bench Press, then Arm Curl.
    expect(sorted.map((e) => e.exerciseName)).toEqual([
      "Squat",
      "Bench Press",
      "Arm Curl",
    ]);
  });

  it("prioritizes user-set order over alphabetical and timestamp order", () => {
    const exercises: PlannedExercise[] = [
      {
        day: 0,
        exerciseId: "ex-1",
        exerciseName: "Squat",
        targetSets: 3,
        targetReps: 10,
        order: 3,
        createdAt: "2026-10-12T10:00:00.000Z",
        updatedAt: "2026-10-12T10:00:00.000Z",
      },
      {
        day: 0,
        exerciseId: "ex-2",
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: 10,
        order: 1,
        createdAt: "2026-10-12T10:05:00.000Z",
        updatedAt: "2026-10-12T10:05:00.000Z",
      },
      {
        day: 0,
        exerciseId: "ex-3",
        exerciseName: "Arm Curl",
        targetSets: 3,
        targetReps: 10,
        order: 2,
        createdAt: "2026-10-12T10:10:00.000Z",
        updatedAt: "2026-10-12T10:10:00.000Z",
      },
    ];

    const sorted = sortPlannedExercises(exercises);

    expect(sorted.map((e) => e.exerciseName)).toEqual([
      "Bench Press",
      "Arm Curl",
      "Squat",
    ]);
  });

  it("handles legacy exercises without explicit order using updatedAt timestamp", () => {
    const exercises: PlannedExercise[] = [
      {
        day: 1,
        exerciseId: "ex-1",
        exerciseName: "Tricep Pushdown",
        targetSets: 3,
        targetReps: 12,
        updatedAt: "2026-10-10T08:00:00.000Z",
      },
      {
        day: 1,
        exerciseId: "ex-2",
        exerciseName: "Barbell Row",
        targetSets: 4,
        targetReps: 8,
        updatedAt: "2026-10-10T08:15:00.000Z",
      },
      {
        day: 1,
        exerciseId: "ex-3",
        exerciseName: "Lat Pulldown",
        targetSets: 3,
        targetReps: 10,
        updatedAt: "2026-10-10T08:30:00.000Z",
      },
    ];

    const sorted = sortPlannedExercises(exercises);

    expect(sorted.map((e) => e.exerciseName)).toEqual([
      "Tricep Pushdown",
      "Barbell Row",
      "Lat Pulldown",
    ]);
  });

  it("places explicitly ordered exercises before un-ordered ones", () => {
    const exercises: PlannedExercise[] = [
      {
        day: 2,
        exerciseId: "ex-1",
        exerciseName: "Deadlift",
        targetSets: 5,
        targetReps: 5,
        createdAt: "2026-10-12T11:00:00.000Z",
        updatedAt: "2026-10-12T11:00:00.000Z",
      },
      {
        day: 2,
        exerciseId: "ex-2",
        exerciseName: "Overhead Press",
        targetSets: 4,
        targetReps: 6,
        order: 1,
        createdAt: "2026-10-12T12:00:00.000Z",
        updatedAt: "2026-10-12T12:00:00.000Z",
      },
    ];

    const sorted = sortPlannedExercises(exercises);

    expect(sorted.map((e) => e.exerciseName)).toEqual([
      "Overhead Press",
      "Deadlift",
    ]);
  });
});
