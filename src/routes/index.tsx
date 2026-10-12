import { createFileRoute } from "@tanstack/react-router";
import GymApp from "@/features/gym/GymApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ironpath | Gym Workout Planner & Progress Tracker" },
      { name: "description", content: "Plan your weekly gym workouts, log every set, and track your strength progress over time with Ironpath." },
      { property: "og:title", content: "Ironpath | Gym Workout Planner & Progress Tracker" },
      { property: "og:description", content: "Plan your weekly gym workouts, log every set, and track your strength progress over time with Ironpath." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <GymApp />;
}
