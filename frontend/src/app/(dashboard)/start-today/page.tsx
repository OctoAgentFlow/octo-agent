import { redirect } from "next/navigation";

export default function StartTodayPage() {
  redirect("/exposure-radar?tab=today&activation=first_day#first-day-path");
}
