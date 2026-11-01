import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { AuthForm } from "@/features/auth/components/auth-form";
import { resetPasswordAction } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Definir nova senha</CardTitle>
        <CardDescription>Escolha uma senha com pelo menos 8 caracteres</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm action={resetPasswordAction} submitLabel="Salvar nova senha">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Nova senha</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </AuthForm>
      </CardContent>
    </Card>
  );
}
