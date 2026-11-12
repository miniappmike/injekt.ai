"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { AuthState } from "./actions";

/** Frosted-glass pill, shared by the fields. */
const FIELD =
  "h-12 w-full rounded-full border border-white/15 bg-white/[0.08] px-5 text-[15px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] backdrop-blur-xl transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-white/50 hover:border-white/25 focus-visible:border-white/50 focus-visible:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/10";
const TEXT_LINK = "font-semibold text-white underline underline-offset-4 decoration-white/40 transition-colors hover:decoration-white";

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
    <div className="w-full animate-fade-up [animation-delay:60ms]">
      <h1 className="text-[2.6rem] font-bold leading-[1.08] tracking-tight text-white sm:text-5xl">
        {isLogin ? <>Log In to<br />Model Spawn</> : <>Create Your<br />Account</>}
      </h1>
      <p className="mt-3 text-[15px] text-white/70">
        {isLogin ? "Welcome back. Pick up where you left off." : "Create your model once, then put her in any photo."}
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-3">
        {next && <input type="hidden" name="next" value={next} />}
        <label htmlFor="email" className="sr-only">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="Email" required className={FIELD} />
        <label htmlFor="password" className="sr-only">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          placeholder={isLogin ? "Password" : "Password (8+ characters)"}
          minLength={8}
          required
          className={FIELD}
        />
        {!isLogin && (
          <div className="flex flex-col gap-2.5 rounded-3xl border border-white/15 bg-black/25 px-5 py-4 text-sm text-white/85 shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] backdrop-blur-xl">
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="adult" required className="mt-0.5 h-4 w-4 shrink-0" />
              <span>I am 18 years of age or older.</span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className={TEXT_LINK}>Terms of Service</Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className={TEXT_LINK}>Privacy Policy</Link>.
              </span>
            </label>
          </div>
        )}
        {state.error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white backdrop-blur-xl">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="flex items-start gap-2 rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-sm text-white backdrop-blur-xl">
            <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 h-12 w-full select-none rounded-full bg-white text-[15px] font-semibold text-[#2a0512] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.7)] transition-all duration-150 hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-60"
        >
          {pending ? "Please wait..." : isLogin ? "Log In" : "Create Account"}
        </button>
      </form>

      <div className="mt-6 flex items-center gap-4 text-xs text-white/50">
        <span className="h-px flex-1 bg-white/15" />
        or
        <span className="h-px flex-1 bg-white/15" />
      </div>
      <Link
        href={isLogin ? "/signup" : "/login"}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-[15px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] backdrop-blur-xl transition-colors duration-150 hover:border-white/30 hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/15"
      >
        {isLogin ? "Create an Account" : "I Already Have an Account"}
      </Link>
    </div>
  );
}
