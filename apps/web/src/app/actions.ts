"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { services } from "@/server/db";
import { deleteSession, SESSION_COOKIE } from "@/server/session";

export async function signOut() {
  const jar = await cookies();
  await deleteSession(services().handle.db, jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
