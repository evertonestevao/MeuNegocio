import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/config/demo";

/** Entra na demonstração. Só grava o perfil no cookie: nada aqui fala com o banco. */
export function GET(request: NextRequest) {
  const technician = request.nextUrl.searchParams.get("perfil") === "tecnico";
  const response = NextResponse.redirect(new URL(technician ? "/dashboard/my-visits" : "/dashboard", request.url));
  response.cookies.set(DEMO_COOKIE, technician ? "technician" : "owner", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 2,
  });
  return response;
}
