"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuthState } from "./actions";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === "login";

  return (
    <Card className="w-full max-w-sm animate-pop-in bg-neutral-900/70 backdrop-blur-xl [animation-delay:60ms]">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">{isLogin ? "Log in" : "Create account"}</CardTitle>
        <CardDescription>
          {isLogin ? "Welcome back to Model Spawn." : "Create your model once, then put her in any photo."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {next && <input type="hidden" name="next" value={next} />}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </div>
          {!isLogin && (
            <div className="flex flex-col gap-2.5 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm text-neutral-300">
              <label className="flex items-start gap-2.5">
                <input type="checkbox" name="adult" required className="mt-0.5 h-4 w-4 shrink-0" />
                <span>I am 18 years of age or older.</span>
              </label>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">Terms of Service</Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="font-semibold text-brand-400 underline-offset-4 hover:text-brand-300 hover:underline">Privacy Policy</Link>.
                </span>
              </label>
            </div>
          )}
          {state.error && <p role="alert" className="text-sm text-red-400">{state.error}</p>}
          {state.message && <p role="status" className="text-sm text-emerald-400">{state.message}</p>}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Please wait..." : isLogin ? "Log in" : "Sign up"}
          </Button>
          <p className="text-center text-sm text-neutral-400">
            {isLogin ? "New here? " : "Already have an account? "}
            <Link href={isLogin ? "/signup" : "/login"} className="font-semibold text-brand-400 transition-colors hover:text-brand-300">
              {isLogin ? "Sign up" : "Log in"}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
