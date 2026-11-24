import { redirect } from "next/navigation";

type ChannelCategoriesRedirectSearchParams = Record<string, string | string[] | undefined>;

type ChannelCategoriesRedirectPageProps = {
  searchParams?: ChannelCategoriesRedirectSearchParams | Promise<ChannelCategoriesRedirectSearchParams>;
};

export default async function ChannelCategoriesRedirectPage({ searchParams }: ChannelCategoriesRedirectPageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (key === "tab" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        nextSearchParams.append(key, item);
      }
      continue;
    }
    nextSearchParams.set(key, value);
  }

  nextSearchParams.set("tab", "contentProfile");
  redirect(`/settings?${nextSearchParams.toString()}`);
}
