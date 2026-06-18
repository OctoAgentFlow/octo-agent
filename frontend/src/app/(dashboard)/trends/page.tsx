import { redirect } from "next/navigation";

export default function TrendsPage() {
  redirect("/exposure-radar?view=source-health");
}
