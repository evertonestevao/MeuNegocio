import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/config/demo";

/**
 * Entra na demonstração. Só grava o perfil no cookie: nada aqui fala com o banco. O destino é
 * relativo porque, atrás de túnel ou proxy, o host de request.url é o interno, como localhost.
 */
export function GET(request: NextRequest) {
  const technician = request.nextUrl.searchParams.get("perfil") === "tecnico";
  const response = new NextResponse(null, {
    status: 307,
    headers: { location: technician ? "/dashboard/my-visits" : "/dashboard" },
  });
  response.cookies.set(DEMO_COOKIE, technician ? "technician" : "owner", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: request.headers.get("x-forwarded-proto") === "https",
    maxAge: 60 * 60 * 2,
  });
  return response;
}
