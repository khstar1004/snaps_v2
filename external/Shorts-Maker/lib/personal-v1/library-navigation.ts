export const PERSONAL_V1_LIBRARY_SECTIONS = [
  { id: "projects", label: "프로젝트", href: "/projects" },
  { id: "videos", label: "완성 영상", href: "/assets?view=videos" },
  { id: "supporting", label: "보조 자산", href: "/assets?view=supporting" },
] as const;

export type PersonalV1LibrarySectionId = (typeof PERSONAL_V1_LIBRARY_SECTIONS)[number]["id"];
export type PersonalV1AssetsView = Exclude<PersonalV1LibrarySectionId, "projects">;

export function getPersonalV1AssetsViewFromSearch(search: string): PersonalV1AssetsView {
  const value = new URLSearchParams(search).get("view") || "";
  if (value === "supporting" || value === "assets") return "supporting";
  return "videos";
}

export function buildPersonalV1LibraryHref(sectionId: PersonalV1LibrarySectionId): string {
  return PERSONAL_V1_LIBRARY_SECTIONS.find((section) => section.id === sectionId)?.href || "/projects";
}
