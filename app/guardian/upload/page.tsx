import { redirect } from "next/navigation";

export default function GuardianUploadRedirectPage() {
  redirect("/guardian/setup");
}
