import { redirect } from "next/navigation";

export default function GuardianStepsRedirectPage() {
  redirect("/guardian/setup");
}
