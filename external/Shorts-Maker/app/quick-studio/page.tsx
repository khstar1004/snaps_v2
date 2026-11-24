import { redirect } from "next/navigation";

export default function QuickStudioPage() {
  redirect("/shorts-json-studio?mode=onboarding");
}
