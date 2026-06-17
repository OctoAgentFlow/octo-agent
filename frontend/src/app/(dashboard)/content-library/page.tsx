import { redirect } from "next/navigation";

type ContentLibraryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContentLibraryPage({ searchParams }: ContentLibraryPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  query.set("panel", "content");

  Object.entries(params || {}).forEach(([key, value]) => {
    if (key === "panel" || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      return;
    }
    query.set(key, value);
  });

  redirect(`/content-drafts?${query.toString()}#content-library`);
}
