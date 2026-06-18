import { redirect } from "next/navigation";

export default function CreatePostPage() {
  redirect("/content-drafts?panel=generate&legacy_source=posts_create");
}
