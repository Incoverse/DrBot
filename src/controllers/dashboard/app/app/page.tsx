import { redirect } from "next/navigation";
import { getSessionFromRequest } from "@/lib/auth";

export default async function RootPage() {
  const session = await getSessionFromRequest();
  if (!session) {
    redirect("/login");
  }
  redirect("/home");
}
